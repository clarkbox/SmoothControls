// SmoothControls — Google Maps 3D / Earth-style camera controller.
//
// Derived from https://github.com/clarkbox/SmoothControls (MIT).
// Copyright (c) 2019 Clark A
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// The pointer stays unlocked, so controls on the page keep working:
// - Left-click + drag (or single-finger touch): perspective-relative ground pan
//   across the XZ plane, keeping the ground point under the cursor anchored,
//   with smooth velocity damping on release.
// - Scroll wheel / trackpad pinch: cursor-anchored zoom toward or away from the
//   ground point under the cursor, clamped to [minDistance, maxDistance].
// - Right-click + drag, middle-drag, Ctrl/Shift + left-drag, or two-finger
//   touch: 360-degree yaw orbit and clamped pitch tilt (15° perspective to 88°
//   top-down map overview) around the ground pivot.
// - Keyboard (when no input/select/textarea is focused): WASD / arrow keys pan
//   across the ground plane, Q/E orbit yaw, +/- (and R/F) zoom in/out.

import { Plane, Raycaster, Vector2, Vector3 } from 'three';

export const MIN_PITCH_DEG = 15;
export const MAX_PITCH_DEG = 88;
export const PITCH_LIMIT_DEG = MAX_PITCH_DEG;
export const MIN_DISTANCE = 2.5;
export const MAX_DISTANCE = 220;
export const DEFAULT_3D_PITCH_DEG = 38;
export const TOP_DOWN_PITCH_DEG = 88;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngleDeg(deg) {
  let a = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (a === -180) a = 180;
  return a;
}

function shortestAngleDeltaDeg(fromDeg, toDeg) {
  return wrapAngleDeg(toDeg - fromDeg);
}

function codeOf(event) {
  if (event.code) return event.code;
  switch (event.keyCode) {
    case 38:
      return 'ArrowUp';
    case 40:
      return 'ArrowDown';
    case 37:
      return 'ArrowLeft';
    case 39:
      return 'ArrowRight';
    case 87:
      return 'KeyW';
    case 65:
      return 'KeyA';
    case 83:
      return 'KeyS';
    case 68:
      return 'KeyD';
    case 81:
      return 'KeyQ';
    case 69:
      return 'KeyE';
    case 82:
      return 'KeyR';
    case 70:
      return 'KeyF';
    case 187:
    case 107:
      return 'Equal';
    case 189:
    case 109:
      return 'Minus';
    case 27:
      return 'Escape';
    default:
      return '';
  }
}

function isEditableElement(el) {
  if (!el || typeof el !== 'object') return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  return false;
}

export class SmoothControls {
  constructor(object, domElement = null) {
    if (!object) throw new Error('SmoothControls requires a three.js object');
    this.object = object;
    this.domElement = domElement;
    this.enabled = true;

    this.movementSpeed = 14;
    this.lookSpeed = 0.005;
    this.orbitSpeed = 0.32;
    this.tiltSpeed = 0.26;
    this.zoomSpeed = 0.0016;
    this.dampingFactor = 10;
    this.minDistance = MIN_DISTANCE;
    this.maxDistance = MAX_DISTANCE;
    this.minPitchDeg = MIN_PITCH_DEG;
    this.maxPitchDeg = MAX_PITCH_DEG;

    this.target = new Vector3(0, 0, 0);
    this._desiredTarget = new Vector3(0, 0, 0);
    this._panVelocity = new Vector3(0, 0, 0);

    // _lat is signed look elevation in degrees: negative means looking down at
    // the ground target (e.g. -38° is 38° above horizon, -88° is top-down).
    // _lon is look azimuth in degrees in the XZ plane (-90° faces -Z / North).
    this._latValue = -DEFAULT_3D_PITCH_DEG;
    this._lonValue = -90;
    this._desiredLat = -DEFAULT_3D_PITCH_DEG;
    this._desiredLon = -90;

    const initialDist = object.position.length();
    this.distance = clamp(
      initialDist > 1e-3 ? initialDist : 24,
      this.minDistance,
      this.maxDistance
    );
    this._desiredDistance = this.distance;
    this._last3DPitchDeg = DEFAULT_3D_PITCH_DEG;

    this._forward = false;
    this._back = false;
    this._left = false;
    this._right = false;
    this._orbitLeft = false;
    this._orbitRight = false;
    this._zoomInKey = false;
    this._zoomOutKey = false;

    this._dragMode = null; // 'pan' | 'orbit' | null
    this._pointerX = 0;
    this._pointerY = 0;
    this._downX = 0;
    this._downY = 0;
    this._dragMovedPx = 0;
    this._lastPanDelta = new Vector3();
    this._lastPanTimeMs = 0;

    this._touchCount = 0;
    this._pinchDist = 0;
    this._pinchAngle = 0;
    this._pinchMidX = 0;
    this._pinchMidY = 0;

    this._flyAnim = null;

    this._raycaster = new Raycaster();
    this._groundPlane = new Plane(new Vector3(0, 1, 0), 0);
    this._ndc = new Vector2();
    this._scratchDir = new Vector3();
    this._scratchGroundPt = new Vector3();
    this._scratchPanStart = new Vector3();
    this._scratchPanEnd = new Vector3();
    this._scratchZoomAnchor = new Vector3();
    this._scratchFlyFromTarget = new Vector3();
    this._scratchFlyToTarget = new Vector3();
    this._scratchRect = { left: 0, top: 0, width: 800, height: 600 };

    this._document = null;
    this._connected = false;

    this._onMouseDown = (event) => this.onMouseDown(event);
    this._onMouseMove = (event) => this.onMouseMove(event);
    this._onMouseUp = (event) => this.onMouseUp(event);
    this._onWheel = (event) => this.onWheel(event);
    this._onKeyDown = (event) => this.onKeyDown(event);
    this._onKeyUp = (event) => this.onKeyUp(event);
    this._onContextMenu = (event) => this.onContextMenu(event);
    this._onTouchStart = (event) => this.onTouchStart(event);
    this._onTouchMove = (event) => this.onTouchMove(event);
    this._onTouchEnd = (event) => this.onTouchEnd(event);

    if (object.position.lengthSq() > 1e-6) {
      this.aimAt(this.target);
    } else {
      this._syncCameraFromSpherical();
    }

    if (domElement) this.connect();
  }

  // Pointer lock is never used. Callers can leave the cursor free.
  get isLocked() {
    return false;
  }

  get _lat() {
    return this._latValue;
  }

  set _lat(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const clamped = clamp(value, -this.maxPitchDeg, -this.minPitchDeg);
    this._latValue = clamped;
    this._desiredLat = clamped;
  }

  get _lon() {
    return this._lonValue;
  }

  set _lon(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    this._lonValue = value;
    this._desiredLon = value;
  }

  get pitchDeg() {
    return clamp(-this._latValue, this.minPitchDeg, this.maxPitchDeg);
  }

  get headingDeg() {
    // -90 deg look azimuth faces North (-Z -> 0 deg compass heading).
    return wrapAngleDeg(this._lonValue + 90);
  }

  get is2D() {
    return this.pitchDeg >= TOP_DOWN_PITCH_DEG - 4;
  }

  get wasDragged() {
    return this._dragMovedPx > 5;
  }

  connect() {
    if (this._connected || !this.domElement) return;
    const doc = this.domElement.ownerDocument || globalThis.document;
    if (!doc) return;
    this._document = doc;
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    this.domElement.addEventListener('wheel', this._onWheel, {
      passive: false,
    });
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    this.domElement.addEventListener('touchstart', this._onTouchStart, {
      passive: false,
    });
    this.domElement.addEventListener('touchmove', this._onTouchMove, {
      passive: false,
    });
    this.domElement.addEventListener('touchend', this._onTouchEnd);
    doc.addEventListener('mousemove', this._onMouseMove);
    doc.addEventListener('mouseup', this._onMouseUp);
    doc.addEventListener('keydown', this._onKeyDown);
    doc.addEventListener('keyup', this._onKeyUp);
    this._connected = true;
  }

  dispose() {
    if (this.domElement && this._connected) {
      this.domElement.removeEventListener('mousedown', this._onMouseDown);
      this.domElement.removeEventListener('wheel', this._onWheel);
      this.domElement.removeEventListener('contextmenu', this._onContextMenu);
      this.domElement.removeEventListener('touchstart', this._onTouchStart);
      this.domElement.removeEventListener('touchmove', this._onTouchMove);
      this.domElement.removeEventListener('touchend', this._onTouchEnd);
    }
    const doc = this._document;
    if (doc && this._connected) {
      doc.removeEventListener('mousemove', this._onMouseMove);
      doc.removeEventListener('mouseup', this._onMouseUp);
      doc.removeEventListener('keydown', this._onKeyDown);
      doc.removeEventListener('keyup', this._onKeyUp);
    }
    this._connected = false;
    this._dragMode = null;
  }

  // Compatibility no-ops: this controller never locks the pointer.
  lock() {}

  unlock() {
    this._dragMode = null;
  }

  _viewportRect() {
    const el = this.domElement;
    const out = this._scratchRect;
    if (el && typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        out.left = rect.left;
        out.top = rect.top;
        out.width = rect.width;
        out.height = rect.height;
        return out;
      }
    }
    out.left = 0;
    out.top = 0;
    out.width = (el && el.clientWidth) || 800;
    out.height = (el && el.clientHeight) || 600;
    return out;
  }

  _lookDirection(
    latDeg = this._latValue,
    lonDeg = this._lonValue,
    out = this._scratchDir
  ) {
    const phi = ((90 - latDeg) * Math.PI) / 180;
    const theta = (lonDeg * Math.PI) / 180;
    return out.set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    );
  }

  _syncCameraFromSpherical() {
    this._latValue = clamp(
      this._latValue,
      -this.maxPitchDeg,
      -this.minPitchDeg
    );
    this._desiredLat = clamp(
      this._desiredLat,
      -this.maxPitchDeg,
      -this.minPitchDeg
    );
    this.distance = clamp(this.distance, this.minDistance, this.maxDistance);
    this._desiredDistance = clamp(
      this._desiredDistance,
      this.minDistance,
      this.maxDistance
    );
    const dir = this._lookDirection(
      this._latValue,
      this._lonValue,
      this._scratchDir
    );
    this.object.position.set(
      this.target.x - this.distance * dir.x,
      this.target.y - this.distance * dir.y,
      this.target.z - this.distance * dir.z
    );
    this.object.lookAt(this.target);
    this.object.updateMatrixWorld();
  }

  // Aim the camera at `target` from its current position without snapping the
  // camera position if it is already within the valid distance/pitch range.
  aimAt(target) {
    if (!target) return;
    const tx = Number.isFinite(target.x) ? target.x : 0;
    const ty = Number.isFinite(target.y) ? target.y : 0;
    const tz = Number.isFinite(target.z) ? target.z : 0;
    this._flyAnim = null;
    this._panVelocity.set(0, 0, 0);
    this.target.set(tx, ty, tz);
    this._desiredTarget.set(tx, ty, tz);

    const pos = this.object.position;
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const dz = tz - pos.z;
    const hyp = Math.hypot(dx, dy, dz);
    if (hyp > 1e-6) {
      const rawLat = (Math.asin(clamp(dy / hyp, -1, 1)) * 180) / Math.PI;
      const lon = (Math.atan2(dz, dx) * 180) / Math.PI;
      const clampedLat = clamp(rawLat, -this.maxPitchDeg, -this.minPitchDeg);
      const clampedDist = clamp(hyp, this.minDistance, this.maxDistance);
      this._latValue = clampedLat;
      this._desiredLat = clampedLat;
      this._lonValue = lon;
      this._desiredLon = lon;
      this.distance = clampedDist;
      this._desiredDistance = clampedDist;
      if (
        Math.abs(rawLat - clampedLat) < 1e-4 &&
        Math.abs(hyp - clampedDist) < 1e-4
      ) {
        this.object.lookAt(this.target);
        this.object.updateMatrixWorld();
        return;
      }
    }
    this._syncCameraFromSpherical();
  }

  // Intersect a screen pixel ray with the horizontal plane passing through
  // `this.target.y`. Pass `out` to reuse a scratch Vector3 without allocating.
  screenToGround(clientX, clientY, planeY = this.target.y, out = null) {
    const rect = this._viewportRect();
    const x =
      typeof clientX === 'number' && Number.isFinite(clientX)
        ? clientX
        : rect.left + rect.width / 2;
    const y =
      typeof clientY === 'number' && Number.isFinite(clientY)
        ? clientY
        : rect.top + rect.height / 2;
    this._ndc.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
    this.object.updateProjectionMatrix?.();
    this.object.updateMatrixWorld();
    this._raycaster.setFromCamera(this._ndc, this.object);
    const ray = this._raycaster.ray;
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = (planeY - ray.origin.y) / ray.direction.y;
    if (t <= 0) return null;
    const clampedT = Math.min(t, this.maxDistance * 4);
    const targetOut = out || new Vector3();
    return targetOut.set(
      ray.origin.x + ray.direction.x * clampedT,
      planeY,
      ray.origin.z + ray.direction.z * clampedT
    );
  }

  // Pan the camera & target across the ground plane so the ground point under
  // `(fromX, fromY)` stays anchored under `(toX, toY)`.
  panScreenDelta(fromX, fromY, toX, toY) {
    const p0 = this.screenToGround(
      fromX,
      fromY,
      this.target.y,
      this._scratchPanStart
    );
    const p1 = this.screenToGround(
      toX,
      toY,
      this.target.y,
      this._scratchPanEnd
    );
    let dx = 0;
    let dz = 0;
    if (p0 && p1) {
      dx = p0.x - p1.x;
      dz = p0.z - p1.z;
    } else {
      const rect = this._viewportRect();
      const scale = (this.distance / Math.max(200, rect.height)) * 1.35;
      const dpx = toX - fromX;
      const dpy = toY - fromY;
      const theta = (this._lonValue * Math.PI) / 180;
      const fwdX = Math.cos(theta);
      const fwdZ = Math.sin(theta);
      const rightX = -fwdZ;
      const rightZ = fwdX;
      dx = (-dpx * rightX + dpy * fwdX) * scale;
      dz = (-dpx * rightZ + dpy * fwdZ) * scale;
    }
    this.target.x += dx;
    this.target.z += dz;
    this._desiredTarget.x += dx;
    this._desiredTarget.z += dz;
    this._lastPanDelta.set(dx, 0, dz);
    this._lastPanTimeMs = Date.now();
    this._syncCameraFromSpherical();
  }

  // Orbit yaw (360°) and tilt pitch (clamped 15°..88°) around `this.target`.
  // Dragging down (deltaY > 0) pitches down toward the overhead 88° top-down
  // angle; dragging up (deltaY < 0) pitches up toward the 15° perspective angle.
  orbitByPixels(deltaX, deltaY) {
    const dLon = deltaX * this.orbitSpeed;
    const dPitch = deltaY * this.tiltSpeed;
    this._lonValue = wrapAngleDeg(this._lonValue + dLon);
    this._desiredLon = this._lonValue;
    const nextPitch = clamp(
      this.pitchDeg + dPitch,
      this.minPitchDeg,
      this.maxPitchDeg
    );
    this._latValue = -nextPitch;
    this._desiredLat = -nextPitch;
    if (nextPitch < TOP_DOWN_PITCH_DEG - 6) {
      this._last3DPitchDeg = nextPitch;
    }
    this._syncCameraFromSpherical();
  }

  // Cursor-anchored zoom: dollies along the ray toward/away from the ground
  // point under `(clientX, clientY)`, clamped to [minDistance, maxDistance].
  zoomAtCursor(scaleFactor, clientX, clientY, immediate = false) {
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return;
    this._flyAnim = null;
    const anchor = this.screenToGround(
      clientX,
      clientY,
      this.target.y,
      this._scratchZoomAnchor
    );
    const oldDist = this._desiredDistance;
    const newDist = clamp(
      oldDist * scaleFactor,
      this.minDistance,
      this.maxDistance
    );
    const ratio = oldDist > 1e-6 ? 1 - newDist / oldDist : 0;
    if (anchor && Math.abs(ratio) > 1e-6) {
      const shiftX = (anchor.x - this._desiredTarget.x) * ratio;
      const shiftZ = (anchor.z - this._desiredTarget.z) * ratio;
      this._desiredTarget.x += shiftX;
      this._desiredTarget.z += shiftZ;
      if (immediate) {
        this.target.copy(this._desiredTarget);
      }
    }
    this._desiredDistance = newDist;
    if (immediate) {
      this.distance = newDist;
      this._syncCameraFromSpherical();
    }
  }

  zoomIn(clientX, clientY) {
    this.zoomAtCursor(0.75, clientX, clientY, false);
  }

  zoomOut(clientX, clientY) {
    this.zoomAtCursor(1 / 0.75, clientX, clientY, false);
  }

  toggleTilt2D3D() {
    this._flyAnim = null;
    if (this.is2D) {
      const restore = clamp(
        this._last3DPitchDeg || DEFAULT_3D_PITCH_DEG,
        this.minPitchDeg,
        70
      );
      this._desiredLat = -restore;
    } else {
      this._last3DPitchDeg = this.pitchDeg;
      this._desiredLat = -TOP_DOWN_PITCH_DEG;
    }
  }

  resetNorth() {
    this._flyAnim = null;
    const delta = shortestAngleDeltaDeg(this._lonValue, -90);
    this._desiredLon = this._lonValue + delta;
  }

  flyTo(opts = {}) {
    const toTarget = this._scratchFlyToTarget.set(
      Number.isFinite(opts.x) ? opts.x : this.target.x,
      Number.isFinite(opts.y) ? opts.y : this.target.y,
      Number.isFinite(opts.z) ? opts.z : this.target.z
    );
    const toDistance = clamp(
      Number.isFinite(opts.distance) ? opts.distance : this.distance,
      this.minDistance,
      this.maxDistance
    );
    const toPitch = clamp(
      Number.isFinite(opts.pitchDeg) ? opts.pitchDeg : this.pitchDeg,
      this.minPitchDeg,
      this.maxPitchDeg
    );
    const targetLon = Number.isFinite(opts.headingDeg)
      ? opts.headingDeg - 90
      : this._lonValue;
    const toLon =
      this._lonValue + shortestAngleDeltaDeg(this._lonValue, targetLon);
    const duration =
      Number.isFinite(opts.duration) && opts.duration >= 0
        ? opts.duration
        : 0.55;

    this._panVelocity.set(0, 0, 0);
    if (duration === 0) {
      this._flyAnim = null;
      this.target.copy(toTarget);
      this._desiredTarget.copy(toTarget);
      this.distance = toDistance;
      this._desiredDistance = toDistance;
      this._latValue = -toPitch;
      this._desiredLat = -toPitch;
      this._lonValue = wrapAngleDeg(toLon);
      this._desiredLon = this._lonValue;
      this._syncCameraFromSpherical();
      return;
    }

    const fromTarget = this._scratchFlyFromTarget.copy(this.target);
    this._flyAnim = {
      elapsed: 0,
      duration,
      fromTarget,
      toTarget,
      fromDistance: this.distance,
      toDistance,
      fromLat: this._latValue,
      toLat: -toPitch,
      fromLon: this._lonValue,
      toLon,
    };
  }

  _isEventOnElement(event) {
    if (!this.domElement) return true;
    if (!event || !event.target) return true;
    return (
      event.target === this.domElement ||
      (typeof this.domElement.contains === 'function' &&
        this.domElement.contains(event.target))
    );
  }

  onContextMenu(event) {
    if (!this.enabled || !this._isEventOnElement(event)) return;
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
  }

  onMouseDown(event) {
    if (!event || !this.enabled || !this._isEventOnElement(event)) return;
    if (isEditableElement(event.target)) return;
    const button = event.button ?? 0;
    const isOrbitModifier = Boolean(
      event.ctrlKey || event.shiftKey || event.metaKey
    );
    if (button === 0 && !isOrbitModifier) {
      this._dragMode = 'pan';
    } else if (
      button === 2 ||
      button === 1 ||
      (button === 0 && isOrbitModifier)
    ) {
      this._dragMode = 'orbit';
    } else {
      return;
    }

    this._flyAnim = null;
    this._panVelocity.set(0, 0, 0);
    this._lastPanDelta.set(0, 0, 0);
    const rect = this._viewportRect();
    const cx =
      typeof event.clientX === 'number'
        ? event.clientX
        : rect.left + rect.width / 2;
    const cy =
      typeof event.clientY === 'number'
        ? event.clientY
        : rect.top + rect.height / 2;
    this._pointerX = cx;
    this._pointerY = cy;
    this._downX = cx;
    this._downY = cy;
    this._dragMovedPx = 0;
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  onMouseMove(event) {
    if (!event || !this.enabled) return;
    const movX = event.movementX ?? event.mozMovementX ?? event.webkitMovementX;
    const movY = event.movementY ?? event.mozMovementY ?? event.webkitMovementY;
    const hasClient =
      typeof event.clientX === 'number' &&
      typeof event.clientY === 'number' &&
      (event.clientX !== 0 || event.clientY !== 0 || movX === undefined);

    if (!this._dragMode) {
      // Headless / programmatic call without mousedown: orbit by movementX/Y.
      if (
        !this.domElement &&
        (typeof movX === 'number' || typeof movY === 'number')
      ) {
        this.orbitByPixels(movX || 0, movY || 0);
      }
      return;
    }

    const nextX = hasClient
      ? event.clientX
      : this._pointerX + (typeof movX === 'number' ? movX : 0);
    const nextY = hasClient
      ? event.clientY
      : this._pointerY + (typeof movY === 'number' ? movY : 0);
    const dx = nextX - this._pointerX;
    const dy = nextY - this._pointerY;
    this._pointerX = nextX;
    this._pointerY = nextY;
    this._dragMovedPx += Math.hypot(dx, dy);

    if (this._dragMode === 'pan') {
      this.panScreenDelta(nextX - dx, nextY - dy, nextX, nextY);
    } else if (this._dragMode === 'orbit') {
      this.orbitByPixels(dx, dy);
    }
  }

  onMouseUp(event) {
    if (!this._dragMode) return;
    if (this._dragMode === 'pan') {
      const ageMs = Date.now() - this._lastPanTimeMs;
      if (ageMs < 80 && this._lastPanDelta.lengthSq() > 1e-6) {
        this._panVelocity.set(
          this._lastPanDelta.x * 18,
          0,
          this._lastPanDelta.z * 18
        );
      }
    }
    this._dragMode = null;
    if (
      event &&
      this._isEventOnElement(event) &&
      typeof event.preventDefault === 'function'
    ) {
      event.preventDefault();
    }
  }

  onWheel(event) {
    if (!event || !this.enabled || !this._isEventOnElement(event)) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    const rawDelta =
      typeof event.deltaY === 'number' && Number.isFinite(event.deltaY)
        ? event.deltaY
        : 0;
    if (rawDelta === 0) return;
    // Normalize line/page wheel modes and trackpad pinch (ctrlKey).
    const modeMultiplier =
      event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? 120 : 1;
    const pinchMultiplier = event.ctrlKey ? 2.2 : 1;
    const clampedDelta = clamp(
      rawDelta * modeMultiplier * pinchMultiplier,
      -240,
      240
    );
    const factor = Math.exp(clampedDelta * this.zoomSpeed);
    this.zoomAtCursor(factor, event.clientX, event.clientY, false);
  }

  onTouchStart(event) {
    if (!event || !this.enabled || !event.touches) return;
    const touches = event.touches;
    this._touchCount = touches.length;
    this._flyAnim = null;
    this._panVelocity.set(0, 0, 0);
    if (touches.length === 1) {
      this._dragMode = 'pan';
      this._pointerX = touches[0].clientX;
      this._pointerY = touches[0].clientY;
      this._downX = this._pointerX;
      this._downY = this._pointerY;
      this._dragMovedPx = 0;
    } else if (touches.length >= 2) {
      this._dragMode = 'orbit';
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      this._pinchDist = Math.hypot(dx, dy);
      this._pinchAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      this._pinchMidX = (touches[0].clientX + touches[1].clientX) / 2;
      this._pinchMidY = (touches[0].clientY + touches[1].clientY) / 2;
    }
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  onTouchMove(event) {
    if (!event || !this.enabled || !event.touches) return;
    const touches = event.touches;
    if (touches.length === 1 && this._dragMode === 'pan') {
      const nextX = touches[0].clientX;
      const nextY = touches[0].clientY;
      const dx = nextX - this._pointerX;
      const dy = nextY - this._pointerY;
      this._pointerX = nextX;
      this._pointerY = nextY;
      this._dragMovedPx += Math.hypot(dx, dy);
      this.panScreenDelta(nextX - dx, nextY - dy, nextX, nextY);
    } else if (touches.length >= 2) {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const midX = (touches[0].clientX + touches[1].clientX) / 2;
      const midY = (touches[0].clientY + touches[1].clientY) / 2;

      if (this._pinchDist > 8 && dist > 8) {
        const scale = this._pinchDist / dist;
        this.zoomAtCursor(scale, midX, midY, true);
      }
      const dAngle = shortestAngleDeltaDeg(this._pinchAngle, angle);
      const dMidY = midY - this._pinchMidY;
      this.orbitByPixels(dAngle / this.orbitSpeed, dMidY);

      this._pinchDist = dist;
      this._pinchAngle = angle;
      this._pinchMidX = midX;
      this._pinchMidY = midY;
    }
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  onTouchEnd(event) {
    const remaining = event && event.touches ? event.touches.length : 0;
    this._touchCount = remaining;
    if (remaining === 0) {
      this._dragMode = null;
    } else if (remaining === 1) {
      this._dragMode = 'pan';
      this._pointerX = event.touches[0].clientX;
      this._pointerY = event.touches[0].clientY;
    }
  }

  onKeyDown(event) {
    if (!this.enabled) return;
    const active =
      (event && event.target) ||
      (this._document && this._document.activeElement);
    if (isEditableElement(active)) return;
    const code = codeOf(event || {});
    if (code === 'Escape') {
      this.unlock();
      return;
    }
    if (code === 'KeyW' || code === 'ArrowUp') this._forward = true;
    else if (code === 'KeyS' || code === 'ArrowDown') this._back = true;
    else if (code === 'KeyA' || code === 'ArrowLeft') this._left = true;
    else if (code === 'KeyD' || code === 'ArrowRight') this._right = true;
    else if (code === 'KeyQ') this._orbitLeft = true;
    else if (code === 'KeyE') this._orbitRight = true;
    else if (code === 'Equal' || code === 'NumpadAdd' || code === 'KeyR')
      this._zoomInKey = true;
    else if (code === 'Minus' || code === 'NumpadSubtract' || code === 'KeyF')
      this._zoomOutKey = true;
  }

  onKeyUp(event) {
    const code = codeOf(event || {});
    if (code === 'KeyW' || code === 'ArrowUp') this._forward = false;
    else if (code === 'KeyS' || code === 'ArrowDown') this._back = false;
    else if (code === 'KeyA' || code === 'ArrowLeft') this._left = false;
    else if (code === 'KeyD' || code === 'ArrowRight') this._right = false;
    else if (code === 'KeyQ') this._orbitLeft = false;
    else if (code === 'KeyE') this._orbitRight = false;
    else if (code === 'Equal' || code === 'NumpadAdd' || code === 'KeyR')
      this._zoomInKey = false;
    else if (code === 'Minus' || code === 'NumpadSubtract' || code === 'KeyF')
      this._zoomOutKey = false;
  }

  update(delta) {
    if (!this.enabled) return;
    const dt = Number.isFinite(delta) && delta >= 0 ? delta : 0;

    if (this._flyAnim) {
      this._flyAnim.elapsed += dt;
      const rawT =
        this._flyAnim.duration > 0
          ? clamp(this._flyAnim.elapsed / this._flyAnim.duration, 0, 1)
          : 1;
      // Cubic ease-out for smooth fly-to framing.
      const ease = 1 - Math.pow(1 - rawT, 3);
      this.target.lerpVectors(
        this._flyAnim.fromTarget,
        this._flyAnim.toTarget,
        ease
      );
      this._desiredTarget.copy(this.target);
      this.distance =
        this._flyAnim.fromDistance +
        (this._flyAnim.toDistance - this._flyAnim.fromDistance) * ease;
      this._desiredDistance = this.distance;
      this._latValue =
        this._flyAnim.fromLat +
        (this._flyAnim.toLat - this._flyAnim.fromLat) * ease;
      this._desiredLat = this._latValue;
      this._lonValue =
        this._flyAnim.fromLon +
        (this._flyAnim.toLon - this._flyAnim.fromLon) * ease;
      this._desiredLon = this._lonValue;
      if (rawT >= 1) {
        this._lonValue = wrapAngleDeg(this._lonValue);
        this._desiredLon = this._lonValue;
        this._flyAnim = null;
      }
      this._syncCameraFromSpherical();
      return;
    }

    if (dt > 0) {
      // Keyboard ground panning along camera horizontal heading.
      const move = dt * this.movementSpeed;
      const theta = (this._lonValue * Math.PI) / 180;
      const fwdX = Math.cos(theta);
      const fwdZ = Math.sin(theta);
      const rightX = -fwdZ;
      const rightZ = fwdX;

      let keyDx = 0;
      let keyDz = 0;
      if (this._forward) {
        keyDx += fwdX * move;
        keyDz += fwdZ * move;
      }
      if (this._back) {
        keyDx -= fwdX * move;
        keyDz -= fwdZ * move;
      }
      if (this._left) {
        keyDx -= rightX * move;
        keyDz -= rightZ * move;
      }
      if (this._right) {
        keyDx += rightX * move;
        keyDz += rightZ * move;
      }
      if (keyDx !== 0 || keyDz !== 0) {
        this.target.x += keyDx;
        this.target.z += keyDz;
        this._desiredTarget.x += keyDx;
        this._desiredTarget.z += keyDz;
      }

      if (this._orbitLeft) {
        this._desiredLon -= 75 * dt;
      }
      if (this._orbitRight) {
        this._desiredLon += 75 * dt;
      }
      if (this._zoomInKey) {
        this._desiredDistance = clamp(
          this._desiredDistance * Math.exp(-1.1 * dt),
          this.minDistance,
          this.maxDistance
        );
      }
      if (this._zoomOutKey) {
        this._desiredDistance = clamp(
          this._desiredDistance * Math.exp(1.1 * dt),
          this.minDistance,
          this.maxDistance
        );
      }

      // Apply inertia / velocity damping after a ground pan drag release.
      if (!this._dragMode && this._panVelocity.lengthSq() > 1e-5) {
        this.target.x += this._panVelocity.x * dt;
        this.target.z += this._panVelocity.z * dt;
        this._desiredTarget.x += this._panVelocity.x * dt;
        this._desiredTarget.z += this._panVelocity.z * dt;
        const decay = Math.exp(-this.dampingFactor * dt);
        this._panVelocity.multiplyScalar(decay);
        if (this._panVelocity.lengthSq() <= 1e-5) {
          this._panVelocity.set(0, 0, 0);
        }
      }

      // Smooth interpolation toward desired zoom/tilt/orbit targets.
      const alpha = 1 - Math.exp(-this.dampingFactor * 1.4 * dt);
      this.target.lerp(this._desiredTarget, alpha);
      this.distance += (this._desiredDistance - this.distance) * alpha;
      this._latValue += (this._desiredLat - this._latValue) * alpha;
      this._lonValue += (this._desiredLon - this._lonValue) * alpha;
    } else {
      this.target.copy(this._desiredTarget);
      this.distance = this._desiredDistance;
      this._latValue = this._desiredLat;
      this._lonValue = this._desiredLon;
    }

    this._syncCameraFromSpherical();
  }
}
