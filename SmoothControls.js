THREE.SmoothControls = function ( object ) {

    //public
    this.enabled = true;
    this.movementSpeed = 1.0;
    this.lookSpeed = 0.005;

    //private
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.object = object;
    this.target = new THREE.Vector3( 0, 0, 0 );
    this.movementX = 0;
    this.movementY = 0;
    this.lat = 0;
    this.lon = 0;
    this.phi = 0;
    this.theta = 0;

    this.update = function( delta ) {

        if ( !this.enabled ) {
            return;
        }

        var actualMoveSpeed = delta * this.movementSpeed;
        var actualLookSpeed = delta * this.lookSpeed;

        if ( this.moveForward  ) this.object.translateZ( - ( actualMoveSpeed ) );
        if ( this.moveBackward ) this.object.translateZ( actualMoveSpeed );

        if ( this.moveLeft ) this.object.translateX( - actualMoveSpeed );
        if ( this.moveRight ) this.object.translateX( actualMoveSpeed );

        if ( this.moveUp ) this.object.translateY( actualMoveSpeed );
        if ( this.moveDown ) this.object.translateY( - actualMoveSpeed );

        this.lon += (20* this.movementX) * actualLookSpeed;
        this.lat -= (20* this.movementY) * actualLookSpeed;// * verticalLookRatio;
        this.movementX = 0;
        this.movementY = 0;

        this.lat = Math.max( - 85, Math.min( 85, this.lat ) );
        this.phi = ( 90 - this.lat ) * Math.PI / 180;
        this.theta = this.lon * Math.PI / 180;

        this.target.x = this.object.position.x + 100 * Math.sin( this.phi ) * Math.cos( this.theta );
        this.target.y = this.object.position.y + 100 * Math.cos( this.phi );
        this.target.z = this.object.position.z + 100 * Math.sin( this.phi ) * Math.sin( this.theta );

        this.object.lookAt( this.target );
    };

    this.onMouseMove = function ( event ) {
        this.movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        this.movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    };

    this.onMouseDown = function ( event ) {
        event.preventDefault();
        event.stopPropagation();
        switch ( event.button ) {
            case 0: this.moveForward = true; break;
            case 2: this.moveBackward = true; break;
        }
    };

    this.onMouseUp = function ( event ) {
        event.preventDefault();
        event.stopPropagation();
        switch ( event.button ) {
            case 0: this.moveForward = false; break;
            case 2: this.moveBackward = false; break;
        }
    };

    this.onKeyDown = function ( event ) {
        switch ( event.keyCode ) {
            case 38: /*up*/
            case 87: /*W*/ this.moveForward = true; break;

            case 37: /*left*/
            case 65: /*A*/ this.moveLeft = true; break;

            case 40: /*down*/
            case 83: /*S*/ this.moveBackward = true; break;

            case 39: /*right*/
            case 68: /*D*/ this.moveRight = true; break;

            case 82: /*R*/ this.moveUp = true; break;
            case 70: /*F*/ this.moveDown = true; break;

            case 81: /*Q*/ this.freeze = !this.freeze; break;
        }
    };

    this.onKeyUp = function ( event ) {
        switch( event.keyCode ) {
            case 38: /*up*/
            case 87: /*W*/ this.moveForward = false; break;

            case 37: /*left*/
            case 65: /*A*/ this.moveLeft = false; break;

            case 40: /*down*/
            case 83: /*S*/ this.moveBackward = false; break;

            case 39: /*right*/
            case 68: /*D*/ this.moveRight = false; break;

            case 82: /*R*/ this.moveUp = false; break;
            case 70: /*F*/ this.moveDown = false; break;
        }
    };

    document.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );
    document.addEventListener( 'mousemove', this.onMouseMove.bind(this), false );
    document.addEventListener( 'mousedown', this.onMouseDown.bind(this), false );
    document.addEventListener( 'mouseup', this.onMouseUp.bind(this), false );
    document.addEventListener( 'keydown', this.onKeyDown.bind(this), false );
    document.addEventListener( 'keyup', this.onKeyUp.bind(this), false );

};
