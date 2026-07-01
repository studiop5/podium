export { smuflTable };
// +skip

/**
  Copyright 2025 Glendon Diener
 
  This file is part of Podium.
 
  Podium is free software: you can redistribute it and/or modify it
  under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
  Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public
  License along with Podium. If not, see
  <https://www.gnu.org/licenses/>.
**/


/**
smuflTable (Standard Music Font Layout) exports a single object that maps named groups of smufl glyphs
to lists of the code points for those glyphs that "belong" to the group.. It is used by the panel.SymbolsPanel
to display a drop-down list of named groups as an aid to finding individual glyphs font.  In this codebase, only
the Bravura font is used, but theoretically this mechanism will work for any any smufl-compliant font.

**/

// -skip

let smuflTable = {
  "Recent": "",
  "Basic": "",
  "Signatures": "",
  "4.1. Staff brackets and dividers": "",
  "4.2. Staves": "",
  "4.3. Barlines": "",
  "4.4. Repeats": "",
  "4.5. Clefs": "",
  "4.6. Time signatures": "",
  "4.7. Noteheads": "",
  "4.8. Slash noteheads": "",
  "4.9. Round and square noteheads": "",
  "4.10. Note clusters": "",
  "4.11. Note name noteheads": "",
  "4.12. Shape note noteheads": "",
  "4.13. Individual notes": "",
  "4.14. Beamed groups of notes": "",
  "4.15. Stems": "",
  "4.16. Tremolos": "",
  "4.17. Flags": "",
  "4.18. Standard accidentals (12-EDO)": "",
  "4.19. Gould arrow quartertone accidentals (24-EDO)": "",
  "4.20. Stein-Zimmermann accidentals (24-EDO)": "",
  "4.21. Extended Stein-Zimmermann accidentals": "",
  "4.22. Sims accidentals (72-EDO)": "",
  "4.23. Johnston accidentals (just intonation)": "",
  "4.24. Extended Helmholtz-Ellis accidentals (just intonation)": "",
  "4.25. Spartan Sagittal single-shaft accidentals": "",
  "4.26. Spartan Sagittal multi-shaft accidentals": "",
  "4.27. Athenian Sagittal extension (medium precision) accidentals": "",
  "4.28. Trojan Sagittal extension (12-EDO relative) accidentals": "",
  "4.29. Promethean Sagittal extension (high precision) single-shaft accidentals": "",
  "4.30. Promethean Sagittal extension (high precision) multi-shaft accidentals": "",
  "4.31. Herculean Sagittal extension (very high precision) accidental diacritics": "",
  "4.32. Olympian Sagittal extension (extreme precision) accidental diacritics": "",
  "4.33. Magrathean Sagittal extension (insane precision) accidental diacritics": "",
  "4.34. Wyschnegradsky accidentals (72-EDO)": "",
  "4.35. Arel-Ezgi-Uzdilek (AEU) accidentals": "",
  "4.36. Turkish folk music accidentals": "",
  "4.37. Persian accidentals": "",
  "4.38. Other accidentals": "",
  "4.39. Articulation": "",
  "4.40. Holds and pauses": "",
  "4.41. Rests": "",
  "4.42. Bar repeats": "",
  "4.43. Octaves": "",
  "4.44. Dynamics": "",
  "4.45. Lyrics": "",
  "4.46. Common ornaments": "",
  "4.47. Other baroque ornaments": "",
  "4.48. Combining strokes for trills and mordents": "",
  "4.49. Precomposed trills and mordents": "",
  "4.50. Brass techniques": "",
  "4.51. Wind techniques": "",
  "4.52. String techniques": "",
  "4.53. Plucked techniques": "",
  "4.54. Vocal techniques": "",
  "4.55. Keyboard techniques": "",
  "4.56. Harp techniques": "",
  "4.57. Tuned mallet percussion pictograms": "",
  "4.58. Chimes pictograms": "",
  "4.59. Drums pictograms": "",
  "4.60. Wooden struck or scraped percussion pictograms": "",
  "4.61. Metallic struck percussion pictograms": "",
  "4.62. Bells pictograms": "",
  "4.63. Cymbals pictograms": "",
  "4.64. Gongs pictograms": "",
  "4.65. Shakers or rattles pictograms": "",
  "4.66. Whistles and aerophones pictograms": "",
  "4.67. Miscellaneous percussion instrument pictograms": "",
  "4.68. Beaters pictograms": "",
  "4.69. Percussion playing technique pictograms": "",
  "4.70. Handbells": "",
  "4.71. Guitar": "",
  "4.72. Chord diagrams": "",
  "4.73. Analytics": "",
  "4.74. Chord symbols": "",
  "4.75. Tuplets": "",
  "4.76. Conductor symbols": "",
  "4.77. Accordion": "",
  // "4.78. Beams and slurs": "", 
  "4.79. Medieval and Renaissance staves": "",
  "4.80. Medieval and Renaissance clefs": "",
  "4.81. Medieval and Renaissance prolations": "",
  "4.82. Medieval and Renaissance noteheads and stems": "",
  "4.83. Medieval and Renaissance individual notes": "",
  "4.84. Medieval and Renaissance oblique forms": "",
  "4.85. Medieval and Renaissance plainchant single-note forms": "",
  "4.86. Medieval and Renaissance plainchant multiple-note forms": "",
  "4.87. Medieval and Renaissance plainchant articulations": "",
  "4.88. Medieval and Renaissance accidentals": "",
  "4.89. Medieval and Renaissance rests": "",
  "4.90. Medieval and Renaissance miscellany": "",
  "4.91. Medieval and Renaissance symbols in CMN": "",
  "4.92. Daseian notation": "",
  "4.93. Figured bass": "",
  "4.94. Function theory symbols": "",
  "4.95. Multi-segment lines": "",
  "4.96. Electronic music pictograms": "",
  "4.97. Arrows and arrowheads": "",
/*  "4.98. Combining staff positions": "", */
  "4.99. Renaissance lute tablature": "",
  "4.100. French and English Renaissance lute tablature": "",
  "4.101. Italian and Spanish Renaissance lute tablature": "",
  "4.102. German Renaissance lute tablature": "",
  "4.103. Kievan square notation": "",
  "4.104. Kodály hand signs": "",
  "4.105. Simplified Music Notation": "",
  "4.106. Miscellaneous symbols": "",
  "4.107. Time signatures supplement": "",
  "4.108. Octaves supplement": "",
  "4.109. Metronome marks": "",
  "4.110. Figured bass supplement": "",
  "4.111. Shape note noteheads supplement": "",
  "4.112. Turned time signatures": "",
  "4.113. Reversed time signatures": "",
  "4.114. Function theory symbols supplement": "",
  "4.115. Fingering": "",
  "4.116. Arabic accidentals": "",
  "4.117. Articulation supplement": "",
  "4.118. Stockhausen accidentals (24-EDO)": "",
  "4.119. Standard accidentals for chord symbols": "",
  "4.120. Clefs supplement": "",
  "4.121. Fingering supplement": "",
  "4.122. Kahnotation": "",
  "4.123. German organ tablature": "",
  "4.124. Extended Helmholtz-Ellis accidentals (just intonation) supplement": "",
  "4.125. Other accidentals supplement": "",
  "4.126. Techniques noteheads": "",
  "4.127. Chop (percussive bowing) notation": "",
  "4.128. Medieval and Renaissance prolations supplement": "",
  "4.129. Noteheads supplement": "",
  "4.130. Note name noteheads supplement": "",
  "4.131. Scale degrees": "",
};



