/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "bade75b3bb7187d6cdf3d20f83fa5c2f"
  }, {
    "url": "pwa-512x512.png",
    "revision": "a45507dcc022395f1475b9e894e1e731"
  }, {
    "url": "pwa-192x192.png",
    "revision": "f3cb1588459bfeaf2f6242c6f4972905"
  }, {
    "url": "index.html",
    "revision": "27f2e099c81604eb13e673bfaf7ff273"
  }, {
    "url": "icon.svg",
    "revision": "551dd4a020ac6bd813dd4498b1780f39"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "5617c603ae5c0418521f0d8a32097d5c"
  }, {
    "url": "mediapipe/wasm/vision_wasm_module_internal.wasm",
    "revision": "760ff5b837ae3f7a02f5224cc9aaa8ff"
  }, {
    "url": "mediapipe/wasm/vision_wasm_module_internal.js",
    "revision": "24630dbb09183b5a982baf0bc8e92a79"
  }, {
    "url": "mediapipe/wasm/vision_wasm_internal.wasm",
    "revision": "c47fbcd8ec71a229ca97b6c74777d3c2"
  }, {
    "url": "mediapipe/wasm/vision_wasm_internal.js",
    "revision": "7a7c78acf44f152b9c0c4c72b637d418"
  }, {
    "url": "assets/index-ZZjSKSgc.css",
    "revision": null
  }, {
    "url": "assets/index-CWLusLoi.js",
    "revision": null
  }, {
    "url": "assets/c3dParser-BAsmOyC6.js",
    "revision": null
  }, {
    "url": "assets/aistudio/image_38eacec6.png",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "5617c603ae5c0418521f0d8a32097d5c"
  }, {
    "url": "icon.svg",
    "revision": "551dd4a020ac6bd813dd4498b1780f39"
  }, {
    "url": "pwa-192x192.png",
    "revision": "f3cb1588459bfeaf2f6242c6f4972905"
  }, {
    "url": "pwa-512x512.png",
    "revision": "a45507dcc022395f1475b9e894e1e731"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "bade75b3bb7187d6cdf3d20f83fa5c2f"
  }, {
    "url": "mediapipe/wasm/vision_wasm_internal.js",
    "revision": "7a7c78acf44f152b9c0c4c72b637d418"
  }, {
    "url": "mediapipe/wasm/vision_wasm_internal.wasm",
    "revision": "c47fbcd8ec71a229ca97b6c74777d3c2"
  }, {
    "url": "mediapipe/wasm/vision_wasm_module_internal.js",
    "revision": "24630dbb09183b5a982baf0bc8e92a79"
  }, {
    "url": "mediapipe/wasm/vision_wasm_module_internal.wasm",
    "revision": "760ff5b837ae3f7a02f5224cc9aaa8ff"
  }, {
    "url": "manifest.webmanifest",
    "revision": "f73482560636c4d514bfaea4d968faf8"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.*/i, new workbox.CacheFirst({
    "cacheName": "mediapipe-models-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 4,
      maxAgeSeconds: 7776000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
