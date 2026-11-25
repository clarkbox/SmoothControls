SmoothControls - REAL SMOOOOTH
==============

A first person perspective camera control for threejs. Where you look is where you move to. You can fly! Basically just a copy of [Pointerlock](https://threejs.org/examples/misc_controls_pointerlock.html) with y axis.

`MapSmoothControls.js` is a second controller: a Google Maps style ground camera (pan, zoom toward the cursor, orbit, pitch clamped from 15° to 88°) that never locks the pointer. It is an ES module built against `three@^0.187.0`.

# FILES

- `SmoothControls.js` — first-person fly camera. Assigns `THREE.SmoothControls`. Used by `example.html`.
- `example.html` — fly-camera demo. Loads the vendored `three.min.js` (Three.js r149) and `SmoothControls.js`.
- `three.min.js` — vendored Three.js r149 build for the fly demo.
- `MapSmoothControls.js` — maps-style ground camera, ES module `SmoothControls`. Built against `three@^0.187.0`.
- `example-map.html` — maps-camera demo. Loads `three@0.187.0` and `MapSmoothControls.js`.
- `LICENSE` — MIT. Copyright (c) 2019 Clark A.
- `README.md` — this file.

# USAGE 
W = move forward  
A = move left  
S = move back  
D = move right  
R = move up  
F = move down  
Mouse move = adjust relative yaw and pitch of camera  

# EXAMPLE IMPLEMENTATION
```
var clock = new THREE.Clock();
var controls = this.controls = new THREE.SmoothControls(camera);
controls.enabled = false;
controls.movementSpeed = 1000;
controls.lookSpeed = 0.125;

...

animate: function(){
    ...
    this.controls.update(clock.getDelta());
    ...
}
```

# MAPS CAMERA

`MapSmoothControls.js` exports `SmoothControls`. Pass the camera and the canvas. Call `update` once per frame with the delta in seconds. `example-map.html` is the same setup.

```
import { PerspectiveCamera } from 'three';
import { SmoothControls } from './MapSmoothControls.js';

const camera = new PerspectiveCamera(62, width / height, 0.1, 2000);
camera.position.set(0, 10, 20);
const controls = new SmoothControls(camera, renderer.domElement);
controls.movementSpeed = 14;

controls.update(deltaSeconds);
```

Left drag pans the ground point under the cursor. The wheel zooms toward the cursor. Right drag, middle drag, or Ctrl/Shift + left drag orbits. Yaw is free. Pitch stays between 15° and 88°. WASD or the arrow keys pan, Q and E yaw, and R, F, or +/- zoom. The pointer stays unlocked.

Serve the folder over HTTP. A browser will not load the ES module from `file://`.

Please report any bugs found to the issue tracker.
