SmoothControls - REAL SMOOOOTH
==============

Camera controls for threejs - Pointerlock with y axis


```
...
var clock = new THREE.Clock();
var controls = this.controls = new THREE.SmoothControls( camera );
controls.enabled = false;
controls.movementSpeed = 1000;
controls.lookSpeed = 0.125;
```

```
animate: function(){
    ...
    this.controls.update( clock.getDelta() );
    ...
}
```
