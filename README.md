SmoothControls - REAL SMOOOOTH
==============

A first person perspective camera control for threejs. Where you look is where you move to. You can fly! Basically just a copy of [Pointerlock](https://threejs.org/examples/misc_controls_pointerlock.html) with y axis.

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
