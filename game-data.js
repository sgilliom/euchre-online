// PHD Solution Game — Question Bank
// All scenarios reference real PHD Inc. (phdinc.com) products and automation applications.
// 9 questions: 3 easy (100 pts), 3 medium (150 pts), 3 hard (200 pts)

const questions = [

  // ─── EASY (100 pts) ───────────────────────────────────────────

  {
    id: 1,
    difficulty: 'easy',
    points: 100,
    category: 'Food & Beverage',
    title: 'Ice Cream Cone Pick & Place',
    image: '/img/phd/ice-cream.svg',
    scenario: 'A food manufacturer needs to pick individual ice cream cones off an incoming conveyor and place them upright into packaging trays. The cones are fragile, conical shaped, and must not be crushed or cracked. Cycle rate is 40 parts/min. Which PHD gripper is the BEST choice?',
    choices: [
      { id: 'A', text: 'Standard PHD parallel gripper — reliable two-jaw clamping for consistent part pickup' },
      { id: 'B', text: 'PHD Flexion gripper — bending-finger design that conforms to the cone shape with gentle, adaptive grip' },
      { id: 'C', text: 'PHD angular gripper — opens at an angle, good for large or oddly shaped objects' },
      { id: 'D', text: 'PHD heavy-duty parallel gripper rated for 1,600 lb grip force' }
    ],
    correct: 'B',
    explanation: {
      correct: 'The PHD Flexion gripper replicates the act of bending a finger, giving it a vast range of adaptability for soft and sensitive product handling. Its conforming action gently wraps around the fragile cone without concentrating force at a single point — exactly what PHD designed it for in food applications like this.',
      wrong: {
        A: 'Standard parallel grippers apply force at two rigid contact points. On a conical fragile shape, this concentrates stress and risks cracking or crushing the product.',
        C: 'Angular grippers open at an angle and are suited for large or irregularly shaped objects, not for gentle handling of fragile small items like ice cream cones.',
        D: 'A 1,600 lb capacity heavy-duty gripper is massively over-specified and would instantly crush a delicate ice cream cone.'
      }
    }
  },

  {
    id: 2,
    difficulty: 'easy',
    points: 100,
    category: 'Automotive',
    title: 'High-Cycle Compact Cylinder',
    image: '/img/phd/tom-thumb.svg',
    scenario: 'An automotive assembly line requires a pneumatic cylinder to actuate a small clamp at a station. Available mounting space is extremely limited (under 2 inches). The application expects 50 million+ cycles over the life of the fixture. Which PHD cylinder is the BEST fit?',
    choices: [
      { id: 'A', text: 'PHD Series CV ISO Pneumatic Cylinder — industry-standard ISO mounting, designed for long travel lengths' },
      { id: 'B', text: 'PHD Tom Thumb® Cylinder — compact form factor, proven durability, versatility, and rebuildability for high-cycle use' },
      { id: 'C', text: 'PHD Heavy Duty Cylinder with cartridge bushings and hard chrome-plated alloy steel rod' },
      { id: 'D', text: 'PHD Series ECV Electric Cylinder with ball screw drive' }
    ],
    correct: 'B',
    explanation: {
      correct: 'The PHD Tom Thumb® Cylinder is specifically celebrated for its durability, reliability, strength, versatility, and rebuildability — exactly what a 50 million cycle automotive application demands. Its compact form factor makes it ideal when space is at a premium at assembly stations.',
      wrong: {
        A: 'The Series CV ISO is designed for long travel lengths, not compact limited-space applications. Its ISO form factor is larger than what a 2-inch space allows.',
        C: 'Heavy Duty cylinders are built for high side loads, not specifically for compactness. Their cartridge-bushing design adds bulk not suited for tight-space installations.',
        D: 'An electric cylinder is a valid modern choice but adds cost and controls complexity. For a simple high-cycle pneumatic clamp in a proven automotive fixture, the Tom Thumb® is the right-sized solution.'
      }
    }
  },

  {
    id: 3,
    difficulty: 'easy',
    points: 100,
    category: 'Parts Feeding',
    title: 'Vibratory Bowl to Assembly Station',
    image: '/img/phd/escapement.svg',
    scenario: 'A small parts assembly system uses a vibratory bowl feeder to orient and deliver metal fasteners. The parts exit the bowl in a continuous stream and must be released one at a time, on demand, to a downstream assembly nest. What is the BEST PHD solution for this one-at-a-time release?',
    choices: [
      { id: 'A', text: 'PHD parallel gripper — grabs one part at a time from the chute and transfers it to the nest' },
      { id: 'B', text: 'PHD rotary actuator — indexes a dial plate to advance parts one position at a time' },
      { id: 'C', text: 'PHD pneumatic escapement — designed specifically to release parts one at a time from feeders and magazines' },
      { id: 'D', text: 'PHD powered linear slide — pushes parts along the track to the assembly nest' }
    ],
    correct: 'C',
    explanation: {
      correct: 'PHD pneumatic escapements are purpose-built for exactly this function: releasing parts one at a time from vibratory feeders, hoppers, or part magazines. They handle high side loads from the part queue, available in single and double rod configurations, and are the standard industrial solution for controlled parts dispensing.',
      wrong: {
        A: 'A gripper picks and places parts but requires positional control, sensors, and a robot or slide to move it — far more complex and expensive than an escapement for this task.',
        B: 'A rotary dial indexer works for some feeding applications but adds mechanical complexity and cost. It\'s not the standard solution for vibratory bowl outfeed control.',
        D: 'A linear slide moves a carriage along a path but doesn\'t inherently gate or release single parts from a continuous stream — it has no mechanism to hold back the queue.'
      }
    }
  },

  // ─── MEDIUM (150 pts) ─────────────────────────────────────────

  {
    id: 4,
    difficulty: 'medium',
    points: 150,
    category: 'Food Processing',
    title: 'Meat Processing Washdown Environment',
    image: '/img/phd/washdown.svg',
    scenario: 'A meat processing plant operates conveyor actuators in a zone requiring daily high-pressure, high-temperature caustic washdown and Clean-In-Place (CIP) cycles. Standard cylinders corrode and fail within weeks. The application needs a cylinder rated IP69K. What is the BEST PHD solution?',
    choices: [
      { id: 'A', text: 'PHD standard pneumatic cylinder with a stainless steel piston rod and nitrile seals' },
      { id: 'B', text: 'PHD Plus® Series ECP Electric IP69K Cylinder — 100% designed for high-pressure/high-temperature washdown and CIP environments' },
      { id: 'C', text: 'PHD hydraulic cylinder with high-pressure seals to resist washdown ingress' },
      { id: 'D', text: 'PHD Series CV ISO Pneumatic Cylinder with external protective sleeve' }
    ],
    correct: 'B',
    explanation: {
      correct: 'The PHD Plus® Series ECP Electric IP69K Cylinder is specifically engineered for food processing environments — rated IP69K (the highest ingress protection rating) for high-pressure, high-temperature washdown and CIP. It\'s available in ball screw or lead screw versions, providing high thrust or high speed as needed, built entirely for this use case.',
      wrong: {
        A: 'A standard cylinder with a SS rod only protects the rod itself. The body, seals, and internal components are not rated for caustic chemical ingress under pressure — it will fail quickly in CIP cycles.',
        C: 'Hydraulic cylinders introduce oil contamination risk in a food processing environment — a food safety and regulatory violation. They are not appropriate for food contact zones.',
        D: 'An external sleeve on a standard ISO cylinder is a workaround, not a rated solution. It won\'t meet IP69K requirements and creates maintenance challenges in a hygiene-critical facility.'
      }
    }
  },

  {
    id: 5,
    difficulty: 'medium',
    points: 150,
    category: 'Medical Devices',
    title: 'Syringe Assembly — Cleanroom Precision',
    image: '/img/phd/medical.svg',
    scenario: 'A medical device manufacturer assembles disposable syringes in an ISO Class 7 cleanroom. The gripper must handle syringe barrels with highly repeatable, low and controlled gripping force to avoid deformation. Materials must be FDA-compliant. Which PHD solution is BEST?',
    choices: [
      { id: 'A', text: 'PHD heavy-duty parallel gripper (Series EA/EL) — rugged, high grip force, rebuildable for long service life' },
      { id: 'B', text: 'PHD high-precision miniature electric gripper with FDA-compliant materials and cleanroom-safe design' },
      { id: 'C', text: 'PHD angular gripper — opens at an angle for flexible part handling in confined spaces' },
      { id: 'D', text: 'PHD multi-motion actuator — provides both rotary and linear motion for complex syringe orientations' }
    ],
    correct: 'B',
    explanation: {
      correct: 'PHD offers FDA-approved custom and standard solutions with high precision and compact designs specifically for medical manufacturing. A precision electric miniature gripper provides repeatable, programmable force control critical for not deforming syringe barrels, and cleanroom-compatible materials eliminate contamination risk in an ISO Class 7 environment.',
      wrong: {
        A: 'Series EA/EL heavy-duty grippers are built for high impact, shock loads, and maximum grip force — the opposite of what delicate syringe assembly requires. The grip force would deform or crack the components.',
        C: 'Angular grippers are useful for large or oddly shaped objects. For small precision cylindrical syringe barrels requiring controlled force, they don\'t offer the grip accuracy or force control needed.',
        D: 'A multi-motion actuator provides reach and rotation — it\'s a motion device, not a gripping solution. It cannot hold or handle a syringe part on its own.'
      }
    }
  },

  {
    id: 6,
    difficulty: 'medium',
    points: 150,
    category: 'Automotive',
    title: 'Sheet Metal Welding Fixture',
    image: '/img/phd/welding-clamp.svg',
    scenario: 'An automotive body shop needs to hold stamped sheet metal panels firmly in precise position during robotic spot welding. The fixture must withstand weld spatter, high temperatures, and high clamping forces. The same solution must work across multiple transfer press and welding cell applications. What PHD product is BEST?',
    choices: [
      { id: 'A', text: 'PHD parallel gripper with custom jaws machined to match the panel profile' },
      { id: 'B', text: 'PHD pneumatic clamp — designed for automated sheet metal stamping, welding, metal forming, and assembly' },
      { id: 'C', text: 'PHD Series CV ISO Cylinder with a custom clamping arm bolted to the piston rod' },
      { id: 'D', text: 'PHD powered linear slide with a magnetic workholding end effector' }
    ],
    correct: 'B',
    explanation: {
      correct: 'PHD Pneumatic Clamps are specifically engineered for automated sheet metal stamping, welding, metal forming, and assembly applications. They offer low cost of ownership, exceptional flexibility across fixture designs, and unsurpassed ruggedness for the extreme environment of an automotive body welding cell — weld spatter, heat, and continuous cycling.',
      wrong: {
        A: 'A gripper is designed to pick and release parts, not hold them statically during a process. Grippers lack the rigid, locked clamping action needed to resist welding forces and maintain positional accuracy.',
        C: 'A standard ISO cylinder with a custom arm will work mechanically, but it\'s a high-engineering custom build. PHD\'s purpose-built clamps include the clamping geometry, force, and durability pre-engineered for welding — far lower cost and risk.',
        D: 'Magnetic workholding requires ferromagnetic parts and has no mechanical lock. Weld spatter, heat, and vibration make magnetic holding unreliable, and the linear slide adds unnecessary complexity to a fixed-position clamping job.'
      }
    }
  },

  // ─── HARD (200 pts) ───────────────────────────────────────────

  {
    id: 7,
    difficulty: 'hard',
    points: 200,
    category: 'Assembly Automation',
    title: 'Part Turnaround & Orientation',
    image: '/img/phd/multimotion.svg',
    scenario: 'An assembly line needs to take a part from an incoming conveyor, rotate it 180° to flip its orientation, then extend and place it on an outgoing nest — two independent motions required in sequence. A machine builder proposes using two separate actuators (one cylinder + one rotary). What is the BEST single-device PHD alternative?',
    choices: [
      { id: 'A', text: 'PHD heavy-duty parallel gripper with servo-controlled jaws for variable positioning' },
      { id: 'B', text: 'PHD multi-motion actuator — provides independent rotary and linear motion from a single output shaft' },
      { id: 'C', text: 'PHD rotary actuator alone — can be configured to both rotate and extend with proper tooling' },
      { id: 'D', text: 'PHD powered gantry linear slide with a rotary actuator mounted on the carriage' }
    ],
    correct: 'B',
    explanation: {
      correct: 'PHD multi-motion actuators provide both rotary and linear motion from one output shaft, with the reach and turn motions fully independent from one another for easy sequencing. They are specifically designed for part turnaround and orientation operations — replacing two separate actuators with one compact, integrated solution that reduces cost, plumbing, mounting complexity, and potential failure points.',
      wrong: {
        A: 'A parallel gripper with servo jaws handles gripping, not the reach-and-turn motion required here. This doesn\'t address the orientation and placement motion at all.',
        C: 'A standalone rotary actuator provides rotation only — it has no linear extension capability. You\'d still need a separate cylinder, which is exactly the two-actuator approach being replaced.',
        D: 'A gantry slide with a mounted rotary actuator does accomplish both motions, but it\'s a two-component assembly requiring separate mounting, plumbing, and controls — the opposite of a compact integrated solution.'
      }
    }
  },

  {
    id: 8,
    difficulty: 'hard',
    points: 200,
    category: 'Packaging',
    title: 'Long-Stroke Packaging Line Cylinder',
    image: '/img/phd/long-stroke.svg',
    scenario: 'A packaging line needs to push filled boxes along a transfer chute with a 22-inch stroke at high cycle rates. The OEM requires ISO standard mounting for interchangeability across multiple lines. The cylinder must deliver consistent performance for the 10-year planned machine life. What is the BEST PHD cylinder choice?',
    choices: [
      { id: 'A', text: 'PHD Tom Thumb® Cylinder — compact, durable, available in many bore sizes' },
      { id: 'B', text: 'PHD Heavy Duty Cylinder with cartridge bushings for side load resistance' },
      { id: 'C', text: 'PHD Series CV ISO Pneumatic Cylinder — designed for long travel lengths, long life, ISO standard mounting' },
      { id: 'D', text: 'PHD compact cylinder — space-saving design when envelope is a concern' }
    ],
    correct: 'C',
    explanation: {
      correct: 'The PHD Series CV ISO Pneumatic Cylinder is purpose-built for exactly this scenario: long travel lengths, long life, and ISO-standard mounting for cross-line interchangeability. At a 22-inch stroke, this is the right class of cylinder — the ISO standard mount means any line can use the same fixture design, and the long-life design supports a 10-year machine lifecycle.',
      wrong: {
        A: 'The Tom Thumb® excels in compact, high-cycle, space-constrained applications — not in long-stroke travel. Its design is optimized for short strokes in tight spaces.',
        B: 'Heavy Duty cylinders are designed for high side loads and aggressive environments, not specifically for long stroke travel. They also don\'t offer ISO-standard mounting for interchangeability.',
        D: 'Compact cylinders are optimized for minimal envelope size, not for long strokes. Using one for a 22-inch application would require an undersized, inappropriate product class.'
      }
    }
  },

  {
    id: 9,
    difficulty: 'hard',
    points: 200,
    category: 'Material Handling',
    title: 'Robotic End-of-Arm Tooling — Heavy Stamped Parts',
    image: '/img/phd/angular-gripper.svg',
    scenario: 'A robotic welding cell in an automotive body shop needs end-of-arm tooling to pick stamped steel panels (8–12 lbs each) from a stack, transfer them 18 inches to a welding fixture, and release. The robot makes 800 picks per shift. The gripper must handle high shock loads at robot acceleration, grip externally, and be rebuildable in-house. Which PHD gripper series is BEST?',
    choices: [
      { id: 'A', text: 'PHD Flexion gripper — adaptive bending fingers for gentle, conforming grip on varied shapes' },
      { id: 'B', text: 'PHD high-precision miniature electric gripper — repeatable, controlled force for delicate handling' },
      { id: 'C', text: 'PHD Series EA/EL/EH parallel gripper — rugged design for high impact and shock loads, external gripping, bronze bearings, rebuildable' },
      { id: 'D', text: 'PHD single-rod pneumatic escapement — controlled release mechanism for parts dispensing' }
    ],
    correct: 'C',
    explanation: {
      correct: 'PHD Series EA/EL/EH grippers are specifically built for rugged end-of-arm applications with high impact and shock loads — exactly what a robot accelerating with a 10 lb steel stamping generates. They support both internal and external gripping, bronze bearings provide superior wear resistance for 800 cycles/shift, and they are fully rebuildable in-house to minimize downtime and cost.',
      wrong: {
        A: 'The PHD Flexion gripper is designed for soft, sensitive, fragile product handling. Its conforming bending fingers are the wrong mechanism for gripping rigid heavy steel stampings at high acceleration.',
        B: 'A miniature precision electric gripper is engineered for low-force, high-accuracy applications like medical device assembly. It lacks the structural strength and grip force required for 8–12 lb steel panels under robot-induced shock loads.',
        D: 'An escapement is a parts-feeding device that releases items one at a time from a queue — it has no ability to grip, lift, or transfer a part to a different location.'
      }
    }
  }

];

module.exports = questions;
