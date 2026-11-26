// The aircraft: "Kestrel", a little orange-and-cream bush plane built from
// primitives — a rounded fuselage, a glass canopy, straight wings, a tail,
// a spinning propeller and blinking navigation lights. No borrowed model,
// no borrowed name.
import * as THREE from '../vendor/three.module.min.js';

const ORANGE = 0xe86a1f;
const CREAM = 0xf6ead2;
const DARK = 0x2b2f36;
const GLASS = 0x9fd4e8;

/** Build the plane. Returns { group, propeller, leftNav, rightNav, tailNav }. */
export function buildAircraft() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45, metalness: 0.25 });
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.5, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({
    color: GLASS, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.75,
  });

  // Fuselage: a capsule stretched along -z (the nose points -z, forward).
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 4.6, 6, 14), body);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.y = 0.1;
  group.add(fuselage);

  // Cream cheatline stripe along the belly.
  const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(1.07, 3.4, 4, 12), cream);
  stripe.rotation.x = Math.PI / 2;
  stripe.scale.set(1, 1, 0.55);
  stripe.position.set(0, -0.18, 0.4);
  group.add(stripe);

  // Canopy: a glass bubble over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 12), glass);
  canopy.scale.set(0.95, 0.72, 1.7);
  canopy.position.set(0, 0.85, -0.6);
  group.add(canopy);

  // Main wing: one long thin box with rounded tips, cream underneath.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 2.1), body);
  wing.position.set(0, 0.05, -0.3);
  group.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 2.0), cream);
  wingTipL.position.set(-5.85, 0.05, -0.3);
  group.add(wingTipL);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 5.85;
  group.add(wingTipR);

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 1.3), body);
  tailplane.position.set(0, 0.25, 3.1);
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 1.6), body);
  fin.position.set(0, 0.95, 3.2);
  fin.rotation.x = -0.25;
  group.add(fin);

  // Propeller: a hub, two blades and a faint spinning disc.
  const propeller = new THREE.Group();
  propeller.position.set(0, 0.1, -3.35);
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 12), dark);
  hub.rotation.x = -Math.PI / 2;
  propeller.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.28, 3.4, 0.1);
  const blade1 = new THREE.Mesh(bladeGeo, dark);
  propeller.add(blade1);
  const blade2 = new THREE.Mesh(bladeGeo, dark);
  blade2.rotation.z = Math.PI / 2;
  propeller.add(blade2);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide }),
  );
  propeller.add(disc);
  group.add(propeller);

  // Fixed landing gear: two wheels and a tail wheel.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelL = new THREE.Mesh(wheelGeo, dark);
  wheelL.position.set(-1.15, -1.05, -0.7);
  group.add(wheelL);
  const wheelR = new THREE.Mesh(wheelGeo, dark);
  wheelR.position.set(1.15, -1.05, -0.7);
  group.add(wheelR);
  const strutGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8);
  const strutL = new THREE.Mesh(strutGeo, dark);
  strutL.position.set(-1.15, -0.55, -0.7);
  strutL.rotation.z = 0.25;
  group.add(strutL);
  const strutR = new THREE.Mesh(strutGeo, dark);
  strutR.position.set(1.15, -0.55, -0.7);
  strutR.rotation.z = -0.25;
  group.add(strutR);

  // Navigation lights: red port, green starboard, white tail.
  const leftNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  );
  leftNav.position.set(-5.95, 0.05, -0.3);
  group.add(leftNav);
  const rightNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x2aff5a }),
  );
  rightNav.position.set(5.95, 0.05, -0.3);
  group.add(rightNav);
  const tailNav = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  tailNav.position.set(0, 0.3, 3.9);
  group.add(tailNav);

  return { group, propeller, leftNav, rightNav, tailNav };
}
