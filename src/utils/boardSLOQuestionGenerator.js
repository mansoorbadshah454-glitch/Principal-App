// ==============================================================================
// 🌟 SUPER POWER BUTTON HELPER: Board SLO Question Generator
// Generates realistic conceptual Board SLO questions (Knowledge, Understanding, Application)
// when a school's local syllabus question bank is empty or needs auto-population.
// ==============================================================================

const SUBJECT_TEMPLATES = {
    biology: {
        mcqs: [
            { question: "Which organelle is primarily responsible for cellular respiration and ATP generation?", options: ["Ribosome", "Mitochondria", "Golgi apparatus", "Endoplasmic reticulum"], correctAnswer: "Mitochondria", cognitive: "Knowledge" },
            { question: "During photosynthesis, the light-dependent reactions take place within the:", options: ["Stroma", "Thylakoid membrane", "Outer membrane", "Cytosol"], correctAnswer: "Thylakoid membrane", cognitive: "Knowledge" },
            { question: "If a plant cell is placed in a hypertonic solution, the observed phenomenon will be:", options: ["Turgidity", "Plasmolysis", "Lysis", "De-plasmolysis"], correctAnswer: "Plasmolysis", cognitive: "Understanding" },
            { question: "Which enzyme initiates the digestion of dietary proteins in the human stomach?", options: ["Amylase", "Pepsin", "Trypsin", "Lipase"], correctAnswer: "Pepsin", cognitive: "Knowledge" },
            { question: "The exchange of respiratory gases (O2 and CO2) in human lungs occurs at the:", options: ["Bronchi", "Trachea", "Alveoli", "Bronchioles"], correctAnswer: "Alveoli", cognitive: "Understanding" },
            { question: "According to Mendel's law of segregation, alleles segregate during:", options: ["Mitosis", "Gamete formation (Meiosis)", "Fertilization", "Cleavage"], correctAnswer: "Gamete formation (Meiosis)", cognitive: "Understanding" },
            { question: "Which of the following blood groups is designated as the universal recipient?", options: ["Group O negative", "Group AB positive", "Group A positive", "Group B positive"], correctAnswer: "Group AB positive", cognitive: "Knowledge" },
            { question: "What is the primary ecological role of decomposers in a terrestrial ecosystem?", options: ["Fixing atmospheric nitrogen", "Recycling nutrients back to soil", "Primary energy production", "Controlling predator population"], correctAnswer: "Recycling nutrients back to soil", cognitive: "Application" },
            { question: "A mutation that changes a single nucleotide codon into a stop codon is termed a:", options: ["Silent mutation", "Missense mutation", "Nonsense mutation", "Frameshift mutation"], correctAnswer: "Nonsense mutation", cognitive: "Understanding" },
            { question: "Which hormone regulates the basal metabolic rate in the human body?", options: ["Insulin", "Thyroxine", "Adrenaline", "Glucagon"], correctAnswer: "Thyroxine", cognitive: "Knowledge" },
            { question: "In anaerobic respiration (fermentation) in yeast cells, the final products are:", options: ["Lactic acid and H2O", "Ethanol and CO2", "Glucose and O2", "Pyruvate and ATP"], correctAnswer: "Ethanol and CO2", cognitive: "Understanding" },
            { question: "What adaptation enables xerophytes to minimize transpiration in arid environments?", options: ["Broad thin leaves", "Sunken stomata & thick waxy cuticle", "Absence of roots", "High stomatal density on upper epidermis"], correctAnswer: "Sunken stomata & thick waxy cuticle", cognitive: "Application" }
        ],
        shorts: [
            { question: "[Knowledge] Define Osmosis and differentiate it from Simple Diffusion.", cognitive: "Knowledge" },
            { question: "[Understanding] Why is ATP referred to as the universal energy currency of living cells?", cognitive: "Understanding" },
            { question: "[Understanding] Explain how the lock and key model explains enzyme-substrate specificity.", cognitive: "Understanding" },
            { question: "[Application] Predict the physiological effect on blood glucose if the beta-cells of islets of Langerhans are damaged.", cognitive: "Application" },
            { question: "[Understanding] Differentiate between Aerobic Respiration and Anaerobic Fermentation with respect to ATP yield.", cognitive: "Understanding" },
            { question: "[Knowledge] State two structural differences between Arteries and Veins.", cognitive: "Knowledge" },
            { question: "[Application] A farmer observes stunted crop growth with yellowing leaves (chlorosis). Which mineral deficiency is most likely responsible and why?", cognitive: "Application" },
            { question: "[Understanding] Describe the function of Guard Cells in regulating stomatal opening and closing.", cognitive: "Understanding" },
            { question: "[Application] Explain why antibiotics are effective against bacterial infections but completely ineffective against viral diseases.", cognitive: "Application" },
            { question: "[Knowledge] List the four chambers of the human heart and indicate the path of deoxygenated blood.", cognitive: "Knowledge" },
            { question: "[Understanding] How does feedback inhibition regulate metabolic pathways inside a cell?", cognitive: "Understanding" },
            { question: "[Application] How does deforestation directly affect the global carbon cycle and accelerate climate change?", cognitive: "Application" }
        ],
        longs: [
            { question: "(a) Explain the Light-Dependent and Light-Independent (Calvin Cycle) reactions of Photosynthesis with a labeled schematic diagram. (b) Discuss the limiting factors affecting the rate of photosynthesis in greenhouse crops.", cognitive: "Understanding / Application" },
            { question: "(a) Describe the structure and working of the Human Nephron in urine formation (Filtration, Reabsorption, Secretion). (b) Explain how the Kidney functions as an osmoregulatory organ.", cognitive: "Understanding / Application" },
            { question: "(a) Detail Watson and Crick's double helix model of DNA structure with neat sketches. (b) Explain the semi-conservative mechanism of DNA replication during the S-phase of cell division.", cognitive: "Understanding / Knowledge" }
        ]
    },
    physics: {
        mcqs: [
            { question: "The rate of change of momentum of a body is equal to the applied:", options: ["Impulse", "Force", "Kinetic Energy", "Acceleration"], correctAnswer: "Force", cognitive: "Knowledge" },
            { question: "If the velocity of a moving vehicle is doubled, its kinetic energy becomes:", options: ["Half", "Double", "Four times", "Remains constant"], correctAnswer: "Four times", cognitive: "Understanding" },
            { question: "The SI unit of Gravitational Field Strength is equivalent to:", options: ["N kg^-1 (or m s^-2)", "J m^-1", "W s^-1", "N m^2"], correctAnswer: "N kg^-1 (or m s^-2)", cognitive: "Knowledge" },
            { question: "Which wave property remains completely unchanged when sound travels from air into water?", options: ["Speed", "Wavelength", "Frequency", "Amplitude"], correctAnswer: "Frequency", cognitive: "Understanding" },
            { question: "A ray of light enters from glass (n=1.5) into air. Total internal reflection occurs when the angle of incidence is:", options: ["Less than critical angle", "Equal to 90 degrees", "Greater than critical angle", "Zero degrees"], correctAnswer: "Greater than critical angle", cognitive: "Application" },
            { question: "According to Ohm's Law, the gradient of a Voltage vs Current (V-I) graph represents:", options: ["Conductance", "Resistance", "Electric Power", "Capacitance"], correctAnswer: "Resistance", cognitive: "Knowledge" },
            { question: "Three resistors of 6 Ω each are connected in parallel. Their equivalent resistance is:", options: ["18 Ω", "2 Ω", "12 Ω", "3 Ω"], correctAnswer: "2 Ω", cognitive: "Application" },
            { question: "A step-up transformer converts:", options: ["Low AC voltage to High AC voltage", "AC voltage to DC voltage", "DC voltage to AC voltage", "High current to even higher current"], correctAnswer: "Low AC voltage to High AC voltage", cognitive: "Understanding" },
            { question: "Which type of nuclear radiation has the highest ionizing power and shortest penetration range?", options: ["Alpha (α) particles", "Beta (β) particles", "Gamma (γ) rays", "Neutrons"], correctAnswer: "Alpha (α) particles", cognitive: "Knowledge" },
            { question: "An object is placed at 2F in front of a convex lens. The nature and size of the image formed is:", options: ["Virtual, erect & enlarged", "Real, inverted & same size", "Real, inverted & magnified", "Virtual, inverted & diminished"], correctAnswer: "Real, inverted & same size", cognitive: "Understanding" },
            { question: "Pascal's Law is directly applied in the working mechanism of:", options: ["Hydraulic brakes and lifts", "Aerodynamic airplane wings", "Barometer", "Electric generators"], correctAnswer: "Hydraulic brakes and lifts", cognitive: "Application" },
            { question: "Half-life of a radioactive isotope is 10 days. After 30 days, the remaining fraction of original sample is:", options: ["1/2", "1/4", "1/8", "1/16"], correctAnswer: "1/8", cognitive: "Application" }
        ],
        shorts: [
            { question: "[Knowledge] State Newton's Second Law of Motion and write its standard formula in SI units.", cognitive: "Knowledge" },
            { question: "[Understanding] Why does a passenger fall forward when a fast-moving bus suddenly applies emergency brakes?", cognitive: "Understanding" },
            { question: "[Application] Calculate the work done when a force of 50 N moves a crate through 4 meters at an angle of 60° to the horizontal.", cognitive: "Application" },
            { question: "[Understanding] Differentiate between Mass and Weight. Why does weight vary on the Moon while mass remains constant?", cognitive: "Understanding" },
            { question: "[Application] Why are convex mirrors preferred over plane mirrors as side-view mirrors in automobiles?", cognitive: "Application" },
            { question: "[Knowledge] State Coulomb's Law of Electrostatics and write its mathematical equation.", cognitive: "Knowledge" },
            { question: "[Understanding] How does temperature affect the electrical resistance of metallic conductors vs semiconductors?", cognitive: "Understanding" },
            { question: "[Application] An electric kettle is rated 2200 W at 220 V. Calculate the operating current and the resistance of its heating element.", cognitive: "Application" },
            { question: "[Understanding] Explain Snell's Law of Refraction and define the Critical Angle.", cognitive: "Understanding" },
            { question: "[Knowledge] What is electromagnetic induction? State Faraday's law.", cognitive: "Knowledge" },
            { question: "[Application] Why are cooking utensils made of metals with copper bottoms, while their handles are made of ebonite or wood?", cognitive: "Application" },
            { question: "[Understanding] Differentiate between Nuclear Fission and Nuclear Fusion with one balanced reaction for each.", cognitive: "Understanding" }
        ],
        longs: [
            { question: "(a) Prove that the motion of a simple pendulum is Simple Harmonic Motion (SHM) and derive the formula for its time period. (b) A simple pendulum has a length of 1 meter on Earth. Calculate its time period on the Moon where g_moon = g_earth / 6.", cognitive: "Understanding / Application" },
            { question: "(a) State and prove the Law of Conservation of Momentum for an isolated system of two colliding spheres. (b) A 1000 kg car moving at 20 m/s hits a stationary truck of 4000 kg and sticks to it. Find the common velocity after collision.", cognitive: "Understanding / Application" },
            { question: "(a) Explain the construction, working principle, and mutual induction of an AC Generator with a neat labeled diagram. (b) Differentiate between step-up and step-down transformers and write the turns ratio formula.", cognitive: "Understanding / Knowledge" }
        ]
    },
    chemistry: {
        mcqs: [
            { question: "The number of moles present in 36 grams of pure water (H2O, Molar Mass = 18 g/mol) is:", options: ["1 mole", "2 moles", "0.5 mole", "4 moles"], correctAnswer: "2 moles", cognitive: "Application" },
            { question: "Which element has the highest electronegativity value on the Pauling scale?", options: ["Chlorine", "Oxygen", "Fluorine", "Nitrogen"], correctAnswer: "Fluorine", cognitive: "Knowledge" },
            { question: "An element has atomic number 17. Its electronic configuration in orbitals is:", options: ["2, 8, 7", "2, 8, 8", "2, 8, 5", "2, 7, 8"], correctAnswer: "2, 8, 7", cognitive: "Knowledge" },
            { question: "Which type of chemical bond is formed by mutual sharing of electron pairs between two atoms?", options: ["Ionic bond", "Covalent bond", "Coordinate bond", "Metallic bond"], correctAnswer: "Covalent bond", cognitive: "Understanding" },
            { question: "According to Le Chatelier's principle, increasing pressure on an equilibrium gaseous system shifts it toward:", options: ["Side with more gas moles", "Side with fewer gas moles", "No change", "Reactants always"], correctAnswer: "Side with fewer gas moles", cognitive: "Understanding" },
            { question: "A solution has a pH of 3. What is the nature of this solution?", options: ["Strongly basic", "Weakly basic", "Acidic", "Neutral"], correctAnswer: "Acidic", cognitive: "Knowledge" },
            { question: "In the electrochemical refining of Copper, the impure copper metal is made the:", options: ["Cathode", "Anode", "Electrolyte", "Salt bridge"], correctAnswer: "Anode", cognitive: "Understanding" },
            { question: "Which homologous series of hydrocarbons contains at least one carbon-carbon triple bond (C≡C)?", options: ["Alkanes", "Alkenes", "Alkynes", "Cycloalkanes"], correctAnswer: "Alkynes", cognitive: "Knowledge" },
            { question: "What is the oxidation state of Sulfur in Sulfuric acid (H2SO4)?", options: ["+2", "+4", "+6", "-2"], correctAnswer: "+6", cognitive: "Application" },
            { question: "Which intermolecular force is strongest in liquid water, accounting for its anomalously high boiling point?", options: ["London dispersion forces", "Dipole-dipole interactions", "Hydrogen bonding", "Ion-dipole forces"], correctAnswer: "Hydrogen bonding", cognitive: "Understanding" },
            { question: "The alloy 'Brass' is a solid solution primarily composed of:", options: ["Copper and Tin", "Copper and Zinc", "Iron and Carbon", "Aluminium and Nickel"], correctAnswer: "Copper and Zinc", cognitive: "Knowledge" },
            { question: "Which gas is primarily responsible for the greenhouse effect and ocean acidification?", options: ["O2", "N2", "CO2", "SO2"], correctAnswer: "CO2", cognitive: "Understanding" }
        ],
        shorts: [
            { question: "[Knowledge] State Rutherford's Atomic Model and mention two major defects in his postulates.", cognitive: "Knowledge" },
            { question: "[Understanding] Explain why ionization energy decreases down a group but increases across a period in the periodic table.", cognitive: "Understanding" },
            { question: "[Application] Calculate the molarity of a solution prepared by dissolving 4.0 g of NaOH in water to make 250 mL of solution (Molar mass = 40 g/mol).", cognitive: "Application" },
            { question: "[Understanding] Why does sodium chloride (NaCl) conduct electricity in molten or aqueous state, but not as a solid crystal?", cognitive: "Understanding" },
            { question: "[Knowledge] Define Boyle's Law and Charles's Law with their mathematical equations.", cognitive: "Knowledge" },
            { question: "[Understanding] Differentiate between Saturated, Unsaturated, and Supersaturated solutions.", cognitive: "Understanding" },
            { question: "[Application] Write balanced chemical equations for the reaction of dilute Hydrochloric acid with: (a) Zinc metal, (b) Calcium carbonate.", cognitive: "Application" },
            { question: "[Understanding] Differentiate between Electrolytic Cell and Galvanic (Voltaic) Cell with two differences.", cognitive: "Understanding" },
            { question: "[Knowledge] Define allotropy and list two crystalline allotropic forms of Carbon.", cognitive: "Knowledge" },
            { question: "[Application] Why is food cooked faster in a pressure cooker compared to an open pot at high altitudes?", cognitive: "Application" },
            { question: "[Understanding] Explain how acid rain is formed and its detrimental impact on historical limestone monuments.", cognitive: "Understanding" },
            { question: "[Knowledge] What is the difference between an empirical formula and a molecular formula? Give one example.", cognitive: "Knowledge" }
        ],
        longs: [
            { question: "(a) State Bohr's Atomic Theory and explain its four major postulates. (b) Derive or explain how Bohr successfully removed the stability defect in Rutherford's model.", cognitive: "Understanding / Knowledge" },
            { question: "(a) State Le Chatelier's Principle. Describe the optimum conditions of temperature, pressure, and catalyst for manufacturing Ammonia by Haber's Process. (b) Explain dynamic chemical equilibrium.", cognitive: "Understanding / Application" },
            { question: "(a) Describe the industrial extraction of pure Chlorine and Sodium Hydroxide using Nelson's Diaphragm Cell with a labeled diagram. (b) Detail the redox reactions occurring at the cathode and anode.", cognitive: "Understanding / Application" }
        ]
    },
    mathematics: {
        mcqs: [
            { question: "If A = [2  3; 1  4], the determinant |A| is:", options: ["5", "11", "5", "8"], correctAnswer: "5", cognitive: "Application" },
            { question: "The discriminant of quadratic equation ax^2 + bx + c = 0 is given by:", options: ["b^2 - 4ac", "b^2 + 4ac", "4ac - b^2", "-b ± √(b^2 - 4ac)"], correctAnswer: "b^2 - 4ac", cognitive: "Knowledge" },
            { question: "If the roots of a quadratic equation are real and equal, the discriminant must be:", options: ["Greater than 0", "Equal to 0", "Less than 0", "Negative fraction"], correctAnswer: "Equal to 0", cognitive: "Understanding" },
            { question: "The value of log_a(1) for any positive base a (a ≠ 1) is:", options: ["0", "1", "a", "Infinity"], correctAnswer: "0", cognitive: "Knowledge" },
            { question: "In a right-angled triangle, if perpendicular = 3 and base = 4, then hypotenuse equals:", options: ["5", "7", "12", "25"], correctAnswer: "5", cognitive: "Application" },
            { question: "The trigonometric identity sin^2(θ) + cos^2(θ) is identically equal to:", options: ["0", "1", "tan^2(θ)", "sec^2(θ)"], correctAnswer: "1", cognitive: "Knowledge" },
            { question: "The sum of the interior angles of a convex quadrilateral is:", options: ["180°", "270°", "360°", "540°"], correctAnswer: "360°", cognitive: "Knowledge" },
            { question: "If x + 1/x = 3, then x^2 + 1/x^2 equals:", options: ["9", "7", "11", "6"], correctAnswer: "7", cognitive: "Application" },
            { question: "The slope (gradient) of a line passing through (1, 2) and (3, 6) is:", options: ["2", "4", "1/2", "3"], correctAnswer: "2", cognitive: "Application" },
            { question: "Which of the following numbers is an irrational number?", options: ["√4", "3/5", "√7", "0.75"], correctAnswer: "√7", cognitive: "Understanding" },
            { question: "The distance between points (0, 0) and (6, 8) in Cartesian plane is:", options: ["10", "14", "48", "7"], correctAnswer: "10", cognitive: "Application" },
            { question: "A matrix having only one single row is classified as a:", options: ["Column matrix", "Row matrix", "Square matrix", "Identity matrix"], correctAnswer: "Row matrix", cognitive: "Knowledge" },
            { question: "The geometric mean between 4 and 16 is:", options: ["10", "8", "64", "12"], correctAnswer: "8", cognitive: "Application" },
            { question: "The angle inscribed in a semicircle is always:", options: ["Acute angle (<90°)", "Right angle (90°)", "Obtuse angle (>90°)", "Straight angle (180°)"], correctAnswer: "Right angle (90°)", cognitive: "Understanding" },
            { question: "Factorization of x^2 - 9 results in:", options: ["(x - 3)(x - 3)", "(x + 3)(x - 3)", "(x + 9)(x - 1)", "(x + 3)^2"], correctAnswer: "(x + 3)(x - 3)", cognitive: "Knowledge" }
        ],
        shorts: [
            { question: "[Application] Solve the system of linear equations using Cramer's Rule: 2x - y = 5 and 3x + 2y = 11.", cognitive: "Application" },
            { question: "[Understanding] If α and β are roots of 2x^2 - 3x + 5 = 0, evaluate: (a) α + β, (b) αβ, (c) 1/α + 1/β.", cognitive: "Application" },
            { question: "[Application] Solve the quadratic equation by completing the square method: x^2 - 6x - 7 = 0.", cognitive: "Application" },
            { question: "[Knowledge] State De Morgan's Laws for two sets A and B with mathematical set notation.", cognitive: "Knowledge" },
            { question: "[Application] Simplify using logarithm laws: log(1000) - 2 log(10) + log(√10).", cognitive: "Application" },
            { question: "[Understanding] Prove that the sum of angles of a triangle is 180° using parallel lines.", cognitive: "Understanding" },
            { question: "[Application] Find the value of k if the polynomial P(x) = x^3 - 2x^2 + kx - 6 is exactly divisible by (x - 2).", cognitive: "Application" },
            { question: "[Application] Prove the trigonometric identity: (sec θ - tan θ)(sec θ + tan θ) = 1.", cognitive: "Understanding" },
            { question: "[Application] The hypotenuse of a right-angled triangle is 13 cm and one side is 5 cm. Calculate the third side and the area.", cognitive: "Application" },
            { question: "[Knowledge] Define collinear and non-collinear points with a neat sketch.", cognitive: "Knowledge" },
            { question: "[Application] If U = {1, 2, ..., 10}, A = {2, 4, 6, 8, 10}, find A' (complement of A).", cognitive: "Application" },
            { question: "[Understanding] Prove that opposite angles of an inscribed cyclic quadrilateral are supplementary.", cognitive: "Understanding" },
            { question: "[Application] Find the coordinates of the midpoint of line segment joining A(-4, 6) and B(8, -2).", cognitive: "Application" }
        ],
        longs: [
            { question: "(a) Solve the matrix equation AX = B by Matrix Inversion Method: 3x - 4y = 7 and 5x + 2y = 3. (b) Find the multiplicative inverse A^-1 and verify that A A^-1 = I.", cognitive: "Application" },
            { question: "(a) Prove the Circle Theorem: The angle subtended by an arc at the center of a circle is double the angle subtended by it at any point on the remaining circumference. (b) State given, to prove, construction and statements with reasons.", cognitive: "Understanding / Application" },
            { question: "(a) Resolve into partial fractions: (7x - 25) / ((x - 3)(x - 4)). (b) Verify the result by recombining into a single rational fraction.", cognitive: "Application" },
            { question: "(a) Solve graphically the system of linear equations: 2x + y = 6 and x - y = 0. Show the point of intersection on Cartesian grid. (b) Find the area of the region bounded by these lines and the x-axis.", cognitive: "Application" }
        ]
    },
    english: {
        mcqs: [
            { question: "Identify the part of speech of the underlined word: 'She spoke very softly.'", options: ["Adjective", "Adverb", "Noun", "Preposition"], correctAnswer: "Adverb", cognitive: "Knowledge" },
            { question: "Choose the correct passive voice: 'The chef prepared a delicious dinner.'", options: ["A delicious dinner was prepared by the chef.", "A delicious dinner had prepared by the chef.", "Dinner is prepared by the chef.", "A delicious dinner was being prepared."], correctAnswer: "A delicious dinner was prepared by the chef.", cognitive: "Understanding" },
            { question: "Select the sentence with correct subject-verb agreement:", options: ["Neither the teacher nor the students was present.", "Neither the teacher nor the students were present.", "Either he or I is responsible.", "The flock of birds are flying."], correctAnswer: "Neither the teacher nor the students were present.", cognitive: "Application" },
            { question: "What is the synonym of the word 'Diligent'?", options: ["Careless", "Hardworking", "Arrogant", "Hesitant"], correctAnswer: "Hardworking", cognitive: "Knowledge" },
            { question: "Change into indirect speech: He said, 'I am reading a book.'", options: ["He said that he was reading a book.", "He said that he is reading a book.", "He says he had read a book.", "He told he reads a book."], correctAnswer: "He said that he was reading a book.", cognitive: "Application" },
            { question: "Identify the figure of speech: 'The classroom was a zoo.'", options: ["Simile", "Metaphor", "Personification", "Hyperbole"], correctAnswer: "Metaphor", cognitive: "Understanding" },
            { question: "Choose the correct conditional sentence (Type 2):", options: ["If it rains, we will cancel the match.", "If I won the lottery, I would buy a house.", "If he had worked hard, he would pass.", "If water boils, it turns to steam."], correctAnswer: "If I won the lottery, I would buy a house.", cognitive: "Understanding" },
            { question: "Select the correct antonym of 'Vague':", options: ["Unclear", "Precise", "Ambiguous", "Doubtful"], correctAnswer: "Precise", cognitive: "Knowledge" },
            { question: "Fill in the blank with appropriate preposition: 'He is proficient _____ mathematics.'", options: ["in", "at", "with", "for"], correctAnswer: "in", cognitive: "Application" },
            { question: "Which sentence uses the apostrophe correctly?", options: ["The girls' bags were left in the bus.", "The girl's bags was left in the bus.", "The girls bags' were left.", "The girl bags were left."], correctAnswer: "The girls' bags were left in the bus.", cognitive: "Application" },
            { question: "The central idea or underlying moral message of a poem is called its:", options: ["Rhyme scheme", "Theme", "Stanza", "Meter"], correctAnswer: "Theme", cognitive: "Knowledge" },
            { question: "Identify the clause type: 'Although he was injured, he finished the marathon.'", options: ["Adverbial clause of concession", "Noun clause", "Adjective clause", "Independent coordinate clause"], correctAnswer: "Adverbial clause of concession", cognitive: "Understanding" },
            { question: "Choose the correctly spelled word:", options: ["Accomodation", "Accommodation", "Acommodation", "Accomadation"], correctAnswer: "Accommodation", cognitive: "Knowledge" },
            { question: "What is the function of the transition word 'Furthermore' in a paragraph?", options: ["To introduce a contrasting idea", "To provide additional evidence", "To indicate chronological sequence", "To state a conclusion"], correctAnswer: "To provide additional evidence", cognitive: "Understanding" },
            { question: "Change into passive: 'Who wrote this famous novel?'", options: ["By whom was this famous novel written?", "Who was written this famous novel?", "By who was this famous novel wrote?", "Whom did write this famous novel?"], correctAnswer: "By whom was this famous novel written?", cognitive: "Application" }
        ],
        shorts: [
            { question: "[Comprehension] Read the textbook lesson theme: Why is tolerance and patience considered the cornerstone of a peaceful civil society?", cognitive: "Understanding" },
            { question: "[Grammar Application] Change the voice: (a) 'The government built a new bridge.' (b) 'The technician is repairing the computers.'", cognitive: "Application" },
            { question: "[Direct/Indirect] Convert to indirect speech: The teacher said to the boys, 'Work hard today if you want to succeed tomorrow.'", cognitive: "Application" },
            { question: "[Vocabulary] Use the following idioms in meaningful sentences: (a) 'Break the ice', (b) 'Burn the midnight oil'.", cognitive: "Application" },
            { question: "[Poetry Analysis] Explain the figurative meaning of the metaphor 'The road not taken' by Robert Frost.", cognitive: "Understanding" },
            { question: "[Sentence Structure] Combine into a single compound-complex sentence: 'He was tired. He continued running. He wanted to win the trophy.'", cognitive: "Application" },
            { question: "[Analytical Question] How does media play a constructive role in raising public awareness against corruption?", cognitive: "Application" },
            { question: "[Grammar Correction] Identify and correct errors: 'Each of the student have submitted their assignments on yesterday.'", cognitive: "Application" },
            { question: "[Punctuation] Punctuate the sentence correctly: 'alas the poor old man lost all his savings said ali'", cognitive: "Application" },
            { question: "[Summary Writing] Write a concise 3-sentence summary highlighting the core moral lesson of the prescribed story.", cognitive: "Understanding" },
            { question: "[Vocabulary] Differentiate between the homophones 'Affect' and 'Effect' with two distinct sentences.", cognitive: "Knowledge" },
            { question: "[Comprehension] What message does the poet convey regarding perseverance in the poem 'Try Again'?", cognitive: "Understanding" },
            { question: "[Formal Language] Rewrite the informal sentence in formal academic English: 'The principal got really mad coz kids skipped class.'", cognitive: "Application" }
        ],
        longs: [
            { question: "Write a comprehensive Essay (200-250 words) on 'The Role of Artificial Intelligence & Modern Technology in Education'. Ensure proper introduction, three coherent body paragraphs with topic sentences, and a balanced conclusion.", cognitive: "Application" },
            { question: "Write a formal Letter to the Editor of a national newspaper highlighting the urgent issue of unscheduled loadshedding and water shortage in your locality, offering practical civic remedies.", cognitive: "Application" },
            { question: "Read the unseen passage carefully, construct a precis (one-third length summary) with a suitable title, and answer the three conceptual comprehension questions that follow.", cognitive: "Understanding / Application" },
            { question: "Write a coherent dialogue between two classmates discussing the merits and drawbacks of Social Media usage among youth, maintaining natural tone and correct conversational punctuation.", cognitive: "Application" }
        ]
    }
};

// Generic subject fallback generator
const createGenericSubjectBank = (subjectName) => {
    const s = subjectName || "Subject";
    return {
        mcqs: Array.from({ length: 15 }, (_, i) => ({
            question: `${s} SLO Objective Concept Q.${i + 1}: Select the most scientifically accurate statement regarding the core principles of ${s}:`,
            options: [
                `Option A: Primary postulate of ${s} fundamental theory`,
                `Option B: Secondary alternative interpretation`,
                `Option C: Inverse proportional relationship in ${s}`,
                `Option D: None of the above standard definitions`
            ],
            correctAnswer: `Option A: Primary postulate of ${s} fundamental theory`,
            cognitive: i % 3 === 0 ? "Knowledge" : i % 3 === 1 ? "Understanding" : "Application"
        })),
        shorts: Array.from({ length: 13 }, (_, i) => ({
            question: `[${i % 3 === 0 ? "Knowledge" : i % 3 === 1 ? "Understanding" : "Application"}] Explain the conceptual significance of Topic #${i + 1} in ${s} and illustrate with one practical example.`,
            cognitive: i % 3 === 0 ? "Knowledge" : i % 3 === 1 ? "Understanding" : "Application"
        })),
        longs: Array.from({ length: 4 }, (_, i) => ({
            question: `(a) Detailed theoretical derivation of Chapter #${i + 1} principle in ${s}. (b) Solve the related analytical problem / practical application step-by-step according to Board Marking Rubrics.`,
            cognitive: "Understanding / Application"
        }))
    };
};

/**
 * Generates an instant high-yield Board SLO question pool for the right-side paper canvas.
 */
export const generateBoardSLOPool = (subject, targetCounts) => {
    const cleanSubj = (subject || '').trim().toLowerCase();
    const bank = SUBJECT_TEMPLATES[cleanSubj] || createGenericSubjectBank(subject);

    const neededMcqs = targetCounts.mcq || 12;
    const neededShorts = targetCounts.short || 8;
    const neededLongs = targetCounts.long || 2;

    const paperMcqs = bank.mcqs.slice(0, neededMcqs).map((q, idx) => ({ ...q, id: `slo_mcq_${Date.now()}_${idx}` }));
    const extraMcqs = bank.mcqs.slice(neededMcqs).map((q, idx) => ({ ...q, id: `slo_extra_mcq_${Date.now()}_${idx}` }));

    const paperShorts = bank.shorts.slice(0, neededShorts).map((q, idx) => ({ ...q, type: 'short', id: `slo_short_${Date.now()}_${idx}` }));
    const extraShorts = bank.shorts.slice(neededShorts).map((q, idx) => ({ ...q, type: 'short', id: `slo_extra_short_${Date.now()}_${idx}` }));

    const paperLongs = bank.longs.slice(0, neededLongs).map((q, idx) => ({ ...q, type: 'long', id: `slo_long_${Date.now()}_${idx}` }));
    const extraLongs = bank.longs.slice(neededLongs).map((q, idx) => ({ ...q, type: 'long', id: `slo_extra_long_${Date.now()}_${idx}` }));

    return {
        paper: {
            mcqs: paperMcqs,
            blanks: [],
            true_false: [],
            shorts: paperShorts,
            longs: paperLongs
        },
        pool: {
            mcqs: extraMcqs,
            blanks: [],
            true_false: [],
            shorts: extraShorts,
            longs: extraLongs
        }
    };
};
