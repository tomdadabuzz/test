import { t as buildPoseFromRigParams } from "./index-CxSLwEvY.js";
// src/utils/c3dParser.ts
/**
* Genuine binary C3D parser (Vicon / OptiTrack / Qualisys optical motion capture format).
* Supports Intel IEEE-754 (processor 84) & SGI big-endian (processor 86),
* both float32 (scale < 0) and int16 scaled (scale > 0) point formats.
*/
function readDecFloat(view, offset) {
	const b0 = view.getUint8(offset);
	const b1 = view.getUint8(offset + 1);
	const b2 = view.getUint8(offset + 2);
	const b3 = view.getUint8(offset + 3);
	if (b0 === 0 && b1 === 0 && b2 === 0 && b3 === 0) return 0;
	const reordered = new Uint8Array([
		b2,
		b3,
		b0,
		b1
	]);
	const raw = new DataView(reordered.buffer).getUint32(0, true);
	const sign = raw >>> 15 & 1;
	const exp = (raw >>> 7 & 255) - 2;
	const mant = (raw & 127) << 16 | raw >>> 16;
	const ieee = sign << 31 | (exp & 255) << 23 | mant & 8388607;
	const outDv = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(4));
	outDv.setUint32(0, ieee, true);
	return outDv.getFloat32(0, true);
}
function readC3dFloat(view, offset, procType) {
	if (procType === 85) return readDecFloat(view, offset);
	return view.getFloat32(offset, procType !== 86);
}
function parseParameterSection(view, paramStartBlock, procType) {
	const littleEndian = procType !== 86;
	const base = (paramStartBlock - 1) * 512;
	const result = {
		labels: [],
		rate: 120,
		unitScaleToMeters: .001,
		framesCount: 0
	};
	if (base + 4 >= view.byteLength) return result;
	const numBlocks = view.getUint8(base + 2) || 1;
	const endOffset = Math.min(view.byteLength, base + numBlocks * 512);
	let ptr = base + 4;
	const groupNames = {};
	const readAscii = (start, len) => {
		let s = "";
		for (let i = 0; i < len && start + i < view.byteLength; i++) {
			const code = view.getUint8(start + i);
			if (code >= 32 && code <= 126) s += String.fromCharCode(code);
		}
		return s.trim();
	};
	while (ptr + 4 < endOffset) {
		const nameLen = view.getInt8(ptr);
		const id = view.getInt8(ptr + 1);
		if (nameLen === 0 || id === 0) break;
		const absNameLen = Math.abs(nameLen);
		const name = readAscii(ptr + 2, absNameLen).toUpperCase();
		ptr += 2 + absNameLen;
		if (ptr + 2 > endOffset) break;
		const nextOffsetDelta = view.getInt16(ptr, littleEndian);
		const nextPtr = nextOffsetDelta === 0 ? endOffset : ptr + nextOffsetDelta;
		if (id < 0) groupNames[Math.abs(id)] = name;
		else {
			const groupName = groupNames[id] || "";
			const dataType = view.getInt8(ptr + 2);
			const numDims = view.getUint8(ptr + 3);
			let dataPtr = ptr + 4;
			const dims = [];
			for (let d = 0; d < numDims; d++) dims.push(view.getUint8(dataPtr++));
			if (groupName === "POINT" && name === "LABELS" && dataType === -1 && dims.length >= 2) {
				const strLen = dims[0];
				const count = dims[1];
				for (let i = 0; i < count; i++) result.labels.push(readAscii(dataPtr + i * strLen, strLen));
			} else if (groupName === "POINT" && name === "UNITS" && dataType === -1) {
				const len = dims[0] || 4;
				const unitStr = readAscii(dataPtr, len).toLowerCase();
				if (unitStr.startsWith("m") && !unitStr.startsWith("mm")) result.unitScaleToMeters = 1;
				else if (unitStr.startsWith("cm")) result.unitScaleToMeters = .01;
				else result.unitScaleToMeters = .001;
			} else if (groupName === "POINT" && name === "RATE" && dataType === 4) {
				const r = readC3dFloat(view, dataPtr, procType);
				if (r > 1 && r < 2e3) result.rate = r;
			} else if (groupName === "POINT" && name === "FRAMES" && dataType === 2) result.framesCount = view.getUint16(dataPtr, littleEndian);
		}
		if (nextPtr <= ptr) break;
		ptr = nextPtr;
	}
	return result;
}
function findMarkerIndex(labels, patterns) {
	for (const pat of patterns) {
		const idx = labels.findIndex((l) => l.toUpperCase().includes(pat));
		if (idx !== -1) return idx;
	}
	return -1;
}
function parseC3dToMotionTake(filename, buffer) {
	const view = new DataView(buffer);
	if (view.byteLength < 512) throw new Error("无效的 C3D 文件：文件过小");
	const paramStartBlock = view.getUint8(0);
	if (view.getUint8(1) !== 80) throw new Error("无效的 C3D 文件：缺少 0x50 标志位");
	const paramHeaderBase = (paramStartBlock - 1) * 512;
	const procType = paramHeaderBase + 3 < view.byteLength ? view.getUint8(paramHeaderBase + 3) : 84;
	const littleEndian = procType !== 86;
	const numPoints = view.getUint16(2, littleEndian);
	const numAnalogPerFrame = view.getUint16(4, littleEndian);
	const firstFrame = view.getUint16(6, littleEndian);
	const lastFrame = view.getUint16(8, littleEndian);
	const scaleFactor = readC3dFloat(view, 12, procType);
	const dataStartBlock = view.getUint16(16, littleEndian);
	const headerRate = readC3dFloat(view, 20, procType);
	const params = parseParameterSection(view, paramStartBlock, procType);
	const fps = Math.max(10, Math.min(240, Math.round(headerRate > 1 ? headerRate : params.rate)));
	const frameCount = Math.max(1, params.framesCount || (lastFrame >= firstFrame ? lastFrame - firstFrame + 1 : 0));
	const useFloat = scaleFactor < 0;
	const absScale = Math.abs(scaleFactor) || 1;
	const unitScale = params.unitScaleToMeters;
	const idxMap = {
		head: findMarkerIndex(params.labels, [
			"RFHD",
			"LFHD",
			"HEAD",
			"TOP",
			"C7"
		]),
		lSh: findMarkerIndex(params.labels, [
			"LSHO",
			"L_SHO",
			"LSH"
		]),
		rSh: findMarkerIndex(params.labels, [
			"RSHO",
			"R_SHO",
			"RSH"
		]),
		lElb: findMarkerIndex(params.labels, [
			"LELB",
			"L_ELB",
			"LEL"
		]),
		rElb: findMarkerIndex(params.labels, [
			"RELB",
			"R_ELB",
			"REL"
		]),
		lWri: findMarkerIndex(params.labels, [
			"LWRA",
			"LWRB",
			"LWR",
			"LHAND"
		]),
		rWri: findMarkerIndex(params.labels, [
			"RWRA",
			"RWRB",
			"RWR",
			"RHAND"
		]),
		lHip: findMarkerIndex(params.labels, [
			"LASI",
			"LHIP",
			"LPSI",
			"LTH"
		]),
		rHip: findMarkerIndex(params.labels, [
			"RASI",
			"RHIP",
			"RPSI",
			"RTH"
		]),
		lKne: findMarkerIndex(params.labels, [
			"LKNE",
			"LKNI",
			"L_KNE"
		]),
		rKne: findMarkerIndex(params.labels, [
			"RKNE",
			"RKNI",
			"R_KNE"
		]),
		lAnk: findMarkerIndex(params.labels, [
			"LANK",
			"L_ANK",
			"LFOOT"
		]),
		rAnk: findMarkerIndex(params.labels, [
			"RANK",
			"R_ANK",
			"RFOOT"
		]),
		lToe: findMarkerIndex(params.labels, ["LTOE", "LMT5"]),
		rToe: findMarkerIndex(params.labels, ["RTOE", "RMT5"])
	};
	let dataPtr = (dataStartBlock - 1) * 512;
	const bytesPerPoint = useFloat ? 16 : 8;
	const analogBytes = numAnalogPerFrame * (useFloat ? 4 : 2);
	const readPoint = (ptOffset) => {
		if (ptOffset + bytesPerPoint > view.byteLength) return {
			x: 0,
			y: 0,
			z: 0,
			valid: false
		};
		if (useFloat) {
			const x = readC3dFloat(view, ptOffset, procType) * unitScale;
			const y = readC3dFloat(view, ptOffset + 4, procType) * unitScale;
			const z = readC3dFloat(view, ptOffset + 8, procType) * unitScale;
			return {
				x,
				y,
				z,
				valid: readC3dFloat(view, ptOffset + 12, procType) >= 0 && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
			};
		} else return {
			x: view.getInt16(ptOffset, littleEndian) * absScale * unitScale,
			y: view.getInt16(ptOffset + 2, littleEndian) * absScale * unitScale,
			z: view.getInt16(ptOffset + 4, littleEndian) * absScale * unitScale,
			valid: view.getInt16(ptOffset + 6, littleEndian) >= 0
		};
	};
	let zRange = 0;
	let yRange = 0;
	if (numPoints > 0 && dataPtr + numPoints * bytesPerPoint <= view.byteLength) {
		let minY = 1e400, maxY = -1e400, minZ = 1e400, maxZ = -1e400;
		for (let p = 0; p < numPoints; p++) {
			const pt = readPoint(dataPtr + p * bytesPerPoint);
			if (pt.valid) {
				minY = Math.min(minY, pt.y);
				maxY = Math.max(maxY, pt.y);
				minZ = Math.min(minZ, pt.z);
				maxZ = Math.max(maxZ, pt.z);
			}
		}
		yRange = maxY - minY;
		zRange = maxZ - minZ;
	}
	const c3dIsZUp = zRange > yRange * 1.15;
	const toStudioCoords = (pt) => c3dIsZUp ? {
		x: pt.x,
		y: pt.z,
		z: -pt.y,
		visibility: .99
	} : {
		x: pt.x,
		y: pt.y,
		z: pt.z,
		visibility: .99
	};
	const frames = [];
	const basePose = buildPoseFromRigParams({
		hipPos: {
			x: 0,
			y: .9,
			z: 0
		},
		hipYaw: 0,
		hipRoll: 0,
		torsoPitch: 0,
		torsoYaw: 0,
		headYaw: 0,
		headPitch: 0,
		lHandTarget: {
			x: .35,
			y: 1,
			z: .1
		},
		rHandTarget: {
			x: -.35,
			y: 1,
			z: .1
		},
		lFootTarget: {
			x: .12,
			y: .07,
			z: 0
		},
		rFootTarget: {
			x: -.12,
			y: .07,
			z: 0
		}
	});
	for (let f = 0; f < frameCount; f++) {
		if (dataPtr + numPoints * bytesPerPoint > view.byteLength) break;
		const pts = [];
		for (let p = 0; p < numPoints; p++) {
			const raw = readPoint(dataPtr + p * bytesPerPoint);
			pts.push(raw.valid ? toStudioCoords(raw) : {
				x: 0,
				y: 0,
				z: 0,
				visibility: 0
			});
		}
		dataPtr += numPoints * bytesPerPoint + analogBytes;
		const lm = basePose.map((b) => ({ ...b }));
		const pick = (idx, fallback) => idx >= 0 && idx < pts.length && (pts[idx].visibility ?? 0) > 0 ? pts[idx] : fallback;
		const validPts = pts.filter((p) => (p.visibility ?? 0) > 0);
		if (validPts.length >= 6) {
			const sortedByY = [...validPts].sort((a, b) => a.y - b.y);
			const lowest = sortedByY[0];
			const highest = sortedByY[sortedByY.length - 1];
			const midHip = sortedByY[Math.floor(sortedByY.length * .45)];
			lm[0] = pick(idxMap.head, highest);
			lm[11] = pick(idxMap.lSh, {
				x: midHip.x + .19,
				y: highest.y - .22,
				z: midHip.z,
				visibility: .9
			});
			lm[12] = pick(idxMap.rSh, {
				x: midHip.x - .19,
				y: highest.y - .22,
				z: midHip.z,
				visibility: .9
			});
			lm[13] = pick(idxMap.lElb, {
				x: lm[11].x + .12,
				y: lm[11].y - .24,
				z: lm[11].z,
				visibility: .9
			});
			lm[14] = pick(idxMap.rElb, {
				x: lm[12].x - .12,
				y: lm[12].y - .24,
				z: lm[12].z,
				visibility: .9
			});
			lm[15] = pick(idxMap.lWri, {
				x: lm[13].x + .08,
				y: lm[13].y - .22,
				z: lm[13].z + .06,
				visibility: .9
			});
			lm[16] = pick(idxMap.rWri, {
				x: lm[14].x - .08,
				y: lm[14].y - .22,
				z: lm[14].z + .06,
				visibility: .9
			});
			lm[23] = pick(idxMap.lHip, {
				x: midHip.x + .11,
				y: midHip.y,
				z: midHip.z,
				visibility: .9
			});
			lm[24] = pick(idxMap.rHip, {
				x: midHip.x - .11,
				y: midHip.y,
				z: midHip.z,
				visibility: .9
			});
			lm[25] = pick(idxMap.lKne, {
				x: lm[23].x,
				y: (lm[23].y + lowest.y) * .52,
				z: lm[23].z + .03,
				visibility: .9
			});
			lm[26] = pick(idxMap.rKne, {
				x: lm[24].x,
				y: (lm[24].y + lowest.y) * .52,
				z: lm[24].z + .03,
				visibility: .9
			});
			lm[27] = pick(idxMap.lAnk, {
				x: lm[25].x,
				y: lowest.y + .04,
				z: lm[25].z,
				visibility: .9
			});
			lm[28] = pick(idxMap.rAnk, {
				x: lm[26].x,
				y: lowest.y + .04,
				z: lm[26].z,
				visibility: .9
			});
			lm[29] = {
				x: lm[27].x,
				y: Math.max(.02, lm[27].y - .03),
				z: lm[27].z - .04,
				visibility: .9
			};
			lm[30] = {
				x: lm[28].x,
				y: Math.max(.02, lm[28].y - .03),
				z: lm[28].z - .04,
				visibility: .9
			};
			lm[31] = pick(idxMap.lToe, {
				x: lm[27].x,
				y: Math.max(.015, lm[27].y - .04),
				z: lm[27].z + .12,
				visibility: .9
			});
			lm[32] = pick(idxMap.rToe, {
				x: lm[28].x,
				y: Math.max(.015, lm[28].y - .04),
				z: lm[28].z + .12,
				visibility: .9
			});
			lm[7] = {
				x: lm[0].x + .07,
				y: lm[0].y,
				z: lm[0].z - .05,
				visibility: .9
			};
			lm[8] = {
				x: lm[0].x - .07,
				y: lm[0].y,
				z: lm[0].z - .05,
				visibility: .9
			};
			lm[17] = lm[19] = lm[21] = {
				x: lm[15].x,
				y: lm[15].y - .04,
				z: lm[15].z + .04,
				visibility: .9
			};
			lm[18] = lm[20] = lm[22] = {
				x: lm[16].x,
				y: lm[16].y - .04,
				z: lm[16].z + .04,
				visibility: .9
			};
		}
		frames.push({
			timestampMs: Math.round(f / fps * 1e3),
			landmarks: lm
		});
	}
	if (frames.length === 0) throw new Error("C3D 文件中未解析到有效的 3D 标记点帧数据");
	const firstMinY = Math.min(frames[0].landmarks[27].y, frames[0].landmarks[28].y, frames[0].landmarks[31].y, frames[0].landmarks[32].y);
	if (Math.abs(firstMinY) > .08) {
		const shift = .02 - firstMinY;
		for (const fr of frames) for (const p of fr.landmarks) p.y += shift;
	}
	const cleanName = filename.replace(/\.c3d$/i, "");
	return {
		id: `c3d_${Date.now()}`,
		name: cleanName,
		createdAt: Date.now(),
		fps,
		durationMs: Math.round(frames.length / fps * 1e3),
		source: "imported",
		frames,
		datasetMeta: {
			sequenceId: cleanName.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
			dancerId: "DANCER_01",
			followerDancerId: "",
			danceStyle: "芭蕾 (Ballet)",
			clipName: cleanName,
			musicId: "MUS_001",
			musicStartSec: 0,
			sourceLicense: "C3D 原始光学采集"
		}
	};
}
export { parseC3dToMotionTake };
