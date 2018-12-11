SmoothControls - REAL SMOOOOTH
==============

Camera controls for threejs - Copy of Pointerlock with y axis. This is a first person perspective camera control... where you look is where you move to. Use keyboard and mouse to manipulate the camera:

```
W=move forward
A=move left
S=move back
D=move right
R=move up
F=move down
Mouse move=adjust relative yaw and pitch of camera
```


```
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
