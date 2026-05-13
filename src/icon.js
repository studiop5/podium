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

export { iconPaths };
// -skip

/**
iconPaths
  ...defines the svg paths (rects, ellopses, texts) used for Podium's icons.
  These paths are rendered to the dom using the function common::iconSvg(...).
  Many of these paths were created in Inkscape, then "hand copied" from the resulting
  svg files, while others were created by hand-coding the svg.  As a result, there
  is some unfortunate inconsistencies with how they are rendered, partcularly as
  some use css style defs and some don't.
**/

// This formula creates a circular path segment from 2 arcs.

let circlePath = (r, cx, cy) =>
  `M${cx} ${cy} m${-r} 0
        a ${r},${r} 0 1,0 ${r * 2},0 
        a ${r},${r} 0 1,0 ${-r * 2},0 `;

let scissorsD = "M244 518Q244 499 236.5 479.5Q229 460 229 457Q229 439 267 439Q288 439 335.5 424.5Q383 410 421 393L733 511Q793 533 834 533Q861 533 880.0 524.5Q899 516 926 492L549 348L927 206Q888 166 832 166Q787 166 730 187L421 301Q321 262 251 251Q240 249 236.5 248.0Q233 247 231.5 244.5Q230 242 230.0 236.0Q230 230 238.0 212.5Q246 195 246 175Q246 135 216.0 108.0Q186 81 141.0 81.0Q96 81 67.0 107.5Q38 134 38 175Q38 222 73.5 251.5Q109 281 165 281L233 280Q277 280 310.0 298.5Q343 317 354 348Q325 413 230 413L160 411Q105 411 70.0 439.5Q35 468 35.0 512.0Q35 556 64.0 583.5Q93 611 139 611Q183 611 213.5 584.0Q244 557 244 518ZM146 443Q174 443 192.5 462.0Q211 481 211.0 510.0Q211 539 190.0 559.0Q169 579 138.0 579.0Q107 579 87.5 561.0Q68 543 68.0 514.0Q68 485 91.0 464.0Q114 443 146 443ZM148 249Q117 249 94.0 226.5Q71 204 71 175Q71 148 90.0 130.5Q109 113 138 113Q172 113 192.5 132.5Q213 152 213 185Q213 213 194.5 231.0Q176 249 148 249Z";

const iconPaths = {

"Curtain Black":
  `<rect x="3" y="5" width="18" height="14" rx="1.5" style="fill:#333"/>`,

"Curtain Red":
  `<rect x="3" y="5" width="18" height="14" rx="1.5" style="fill:#A00000"/>`,

Alpha:
  `<circle style="fill:#000;" cx="8" cy="12" r="6"/>
   <circle style="fill:#8888;" cx="14" cy="12" r="6"/>`,

About:
  `<text font-size="24px" y="20" x="7" font-family="Bravura" fill="currentColor">\ued19</text>`,

"Blank Page":
  `<path style="fill:none;stroke:#000;stroke-width:.6" d="M3 3h17v20h-17Z"/>`,

Book:
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:0.6;" d="M11.9,21.3C15.1,20.4 18.3,19.5 23,20.6V6C22.4,5.55 19.8,4.56 19,4.31V15.1c-2.4,0.3-4.8,3.4-7.1,6.2z"/>
  <path style="fill:none;stroke:currentColor;stroke-width:0.6;" d="m3.46,11.2c1.38,-0.6 4.12,-1.8 5.95,0m-6.3,6.9C4.19,17.9 6.76,16.5 9.49,18M3.31,14.7c1.43,-0.6 3.56,-1.8 5.95,0M3.35,8.38c1.44,-0.87 3.98,-1.41 6.32,0M12,6.14C6.99,3.73 3.82,4.29 1.12,6.13L1.02,21.4c3.46,-1.5 6.99,-2.1 10.78,0z" />
  <path style="fill:none;stroke:currentColor;stroke-width:0.6;" d="m13.6,12.3c1,-1.4 2.1,-2.82 3.2,-3.4m-3,6.8c0.3,-0.9 1.4,-2.1 3.1,-3.5M13.7,8.93c1.2,-1.9 2.2,-2.45 3.5,-3.36M11.9,6.14C14,4.03 16.4,2.47 19,1.04V15c-2.8,1.1-5,3.8-7.2,6.4z" />`,

Brush:
  `<path fill="#aaa" stroke="currentColor" stroke-width="0.5" d="m9.16,13.9 1.64,1.4M8.57,14.4 10.3,16M8.6,14.3c-1.18,0.3-2.27,0.7-3.33,1.4-1.39,0.9-1.6,1.1-1.41,2.7-0.1,0.9-1.05,1.2-1.77,1.6 2.93,1.4 4.99,1 6.84,0.1 1.17,-0.6 0.91,-2.8 1.27,-4 4.1,-5 10.3,-9.92 12.2,-14-5.8,2.87-9.2,8.2-13.8,12.2z"/>`,

Cancel:
  `<path fill="#aaa" stroke="currentColor" stroke-width="1.8" d="${circlePath(10,12, 12)} M6 12.5h12"/>`,

Center:
  `<rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" stroke-width="0.6"/>
   <rect x="6" y="6" width="12" height="12" fill="#aaa" stroke="currentColor" stroke-width="0.6"/>`,

Clock:
  `<path fill="#aaa" stroke="currentColor" stroke-width="1.2" d="M3.42,12.9H5.13M11.8,4.68V6.36M11.6,19.7v1.7M18.4,13H20M8.11,8.11 11.8,13.2 11.2,8.24M20.3,13A8.57,8.57 0 0 1 11.7,21.6 8.57,8.57 0 0 1 3.13,13 8.57,8.57 0 0 1 11.7,4.43 8.57,8.57 0 0 1 20.3,13Z" />`,

Clone: 
   `<path fill="none" stroke-width="0.6" stroke="currentColor" d="${circlePath(2,12,3)} ${circlePath(2,4,10)} ${circlePath(2,20,10)} ${circlePath(2,4,20)} ${circlePath(2,20,20)} M4,10h16v10h-16zM12,10v-6.5" />
    <rect width="16" height="10" x="7" y="13" style="fill:#aaa;stroke:currentColor;"/>`,

Close:
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:0.6;transform:scale(1.25,1.25) translate(-3px,-3px);" d="M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z" />`,

  // The Close Panel should not respond to pointer events...this is so that its enclosing svg will be the target of pointerevents, not the enclosed path.
"Close Panel":
  `<path style="pointer-events:none" fill="currentColor" d="M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z" />`,

// Curtain — stage dim toggle. Open = dim off, On = dim active.
Curtain:
  `<g transform="translate(2.4,1.8) scale(0.8)">
   <line x1="1" y1="3.5" x2="23" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
   <path fill="#aaa" stroke="currentColor" stroke-width="0.7" stroke-linejoin="round" d="M2,4 L9,4 C8,10 7,16 6,22 L2,22 Z"/>
   <path fill="none" stroke="currentColor" stroke-width="0.4" stroke-linecap="round" d="M7,4 C6.5,9 6,15 5.5,20"/>
   <path fill="#aaa" stroke="currentColor" stroke-width="0.7" stroke-linejoin="round" d="M22,4 L15,4 C16,10 17,16 18,22 L22,22 Z"/>
   <path fill="none" stroke="currentColor" stroke-width="0.4" stroke-linecap="round" d="M17,4 C17.5,9 18,15 18.5,20"/>
   </g>`,

"Curtain On":
  `<g transform="translate(2.4,1.8) scale(0.8)">
   <line x1="1" y1="3.5" x2="23" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
   <path fill="#aaa" stroke="currentColor" stroke-width="0.7" stroke-linejoin="round" d="M2,4 L14,4 C12,9 11,15 11,22 L2,22 Z"/>
   <path fill="none" stroke="currentColor" stroke-width="0.4" stroke-linecap="round" d="M11,4 C10.5,9 10,15 9.5,20"/>
   <path fill="#aaa" stroke="currentColor" stroke-width="0.7" stroke-linejoin="round" d="M22,4 L10,4 C12,9 13,15 13,22 L22,22 Z"/>
   <path fill="none" stroke="currentColor" stroke-width="0.4" stroke-linecap="round" d="M13,4 C13.5,9 14,15 14.5,20"/>
   </g>`,

 Edit:
  `<path fill="#aaa" stroke-width="0.6" stroke="currentColor" d="${circlePath(2,12,3)} ${circlePath(2,4,10)} ${circlePath(2,20,10)} ${circlePath(2,4,20)} ${circlePath(2,20,20)} M4,10h16v10h-16zM12,10v-6.5" />`,

"Export Page":
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 5h17v17.5h-17Z"/>
   <path style="fill:#ccc;stroke:currentColor;stroke-width:0.3" d="M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>
   <rect x="9.75" y="5.5" width="3.5" height="15" fill="#aaa" stroke="none"/> -->
   <text x="10.5" y="21.5" style="fill:currentColor;font-family:Bravura;font-size:12">\uE634</text>`,

"Import Page":
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 5h17v17.5h-17Z"/>
   <path style="fill:#ccc;stroke:currentColor;stroke-width:0.3" d="M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>
   <rect x="6.75" y="5.5" width="3.5" height="15" fill="#aaa" stroke="none"/>
   <rect x="13" y="5.5" width="3.5" height="15" fill="#aaa" stroke="none"/>
   <text x="7.5" y="21" style="fill:currentColor;font-family:Bravura;font-size:12">\uE635</text>,
   <text x="14" y="21" style="fill:currentColor;font-family:Bravura;font-size:12">\uE635</text>`,

"Copy Page":
  `<g style="transform:scale(.85)">
     <path style="transform:translate(-2.5,-2.5);fill:#aaa;stroke:currentColor;stroke-width:.3" d="M3 2h17v20.5h-17Z"/>
     <path transform=translate(-2.5,-2.5) style="fill:#aaa;stroke:currentColor;stroke-width:0.1" d="M5.5 5h12M5.5 8h12M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>
     <path transform=translate(5,3) style="fill:#ccc;stroke:currentColor;stroke-width:.6" d="M3 2h17v20.5h-17Z"/>
     <path transform=translate(5,3) style="fill:#ccc;stroke:currentColor;stroke-width:0.3" d="M5.5 5h12M5.5 8h12M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>
   </g>`,

"Cut":
  `<path fill="currentColor" transform="translate(3,17) scale(0.02,-0.02) translate(-35,-81)" d="${scissorsD}"/>`,


"Cut Page":
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 2h17v20.5h-17Z"/>
  <path style="fill:none;stroke:currentColor;stroke-width:0.3" d="M5.5 5h12M5.5 8h12M5.5 17h12M5.5 20h12"/>
  <path fill="currentColor" transform="translate(5.5,16) scale(0.013,-0.013) translate(-35,-81)" d="${scissorsD}"/>`,

"Copy":
  `<text y="12" x="6" font-size="11px" font-family="Bravura" fill="#888">\ue050</text>
   <text y="16" x="10" font-size="11px" font-family="Bravura" fill="#currentColor">\ue050</text>`,

 "Delete Page":
    `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 2h17v20.5h-17Z"/>
     <path style="fill:none;stroke:currentColor;stroke-width:0.3" d="M5.5 5h12M5.5 8h12M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>
     <rect x="8" y="8" width="8" height="8" fill="#aaa" stroke="none"/>
     <path fill-rule="evenodd" style="pointer-events:none;" transform="scale(.32) translate(23.5,26.5)" fill="#bbb" stroke-linecap="round" stroke="currentColor" stroke-width="1.0" d="M-4-2h32l-4 32h-24l-4-32l1-2h30l1 2M8-4v-3h8v3"/>,
     <path fill-rule="evenodd" style="pointer-events:none;" transform="scale(.42) translate(14.5,18.5)" fill="#aaa" stroke-linecap="round" stroke="currentColor" stroke-width="0.8" d="m13.7,7.93-1.5,0.6h4.4l1.8,-3.2-1.2,0.5-1.2,-1.1c-0.3,-0.3-0.6,-0.6-0.8,-0.6l-4.4,-0.3 0.9,0.9zM6.97,7.33 8.65,4.77C9.82,3.57 11.2,4.62 11.4,5L12,6.14 10,9.33ZM8.67,12.4 10,12.9 7.87,9.33h-3.9l1.5,0.97-0.9,1.8c-0.3,0.3-0.3,0.8-0.3,1.1l2.1,3.9 0.3,-1.2zm3.03,6.1-3.33,0.3c-1.7,-0.6-1.7,-2.3-1.4,-2.6l0.8,-1.5h3.93zm3.2,-3.8v-1.5l-2.1,3.6 2.1,3.4v-1.4h2c0.6,0 0.6,-0.3 0.9,-0.6l2.1,-3.8-0.9,0.3zm3.8,-5.87 1.8,2.97c0.5,1.7-0.9,2.6-1.5,2.6h-1.5l-2.3,-3.8z"/>`,


Details:
  `<defs><mask id="details">
    <rect x="0" y="0" height="24" width="24" fill="white"></rect>
    <path stroke="none" fill="black" d="M5 15A8 8 0 0 1 19 15Z"/></mask></defs>
    <path mask="url(#details)" fill="#aaa" stroke="currentColor" stroke-width=".6"
      d="M1 18A8 8 0 0 1 23 18ZM5 15A8 8 0 0 1 19 15ZM3 18v-1M6 18v-1.5M9 18v-1M12 18v-2M15 18v-1M18 18v-1.5M21 18v-1M4 15l-1.5-.25M7 11l-1-1M12 10v-2M17 11l1-1M20 15l1.5-.25"/>`,

Drive:
  `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M16.0019 12.4507L12.541 6.34297C12.6559 6.22598 12.7881 6.14924 12.9203 6.09766C11.8998 6.43355 11.4315 7.57961 11.4315 7.57961L5.10895 18.7345C5.01999 19.0843 4.99528 19.4 5.0064 19.6781H11.9072L16.0019 12.4507Z" fill="#34A853"/>
  <path d="M16.002 12.4507L20.0967 19.6781H26.9975C27.0086 19.4 26.9839 19.0843 26.8949 18.7345L20.5724 7.57961C20.5724 7.57961 20.1029 6.43355 19.0835 6.09766C19.2145 6.14924 19.3479 6.22598 19.4628 6.34297L16.002 12.4507Z" fill="#FBBC05"/>
  <path d="M16.0019 12.4514L19.4628 6.34371C19.3479 6.22671 19.2144 6.14997 19.0835 6.09839C18.9327 6.04933 18.7709 6.01662 18.5954 6.00781H18.4125H13.5913H13.4084C13.2342 6.01536 13.0711 6.04807 12.9203 6.09839C12.7894 6.14997 12.6559 6.22671 12.541 6.34371L16.0019 12.4514Z" fill="#188038"/>
  <path d="M11.9082 19.6782L8.48687 25.7168C8.48687 25.7168 8.3732 25.6614 8.21875 25.5469C8.70434 25.9206 9.17633 25.9998 9.17633 25.9998H22.6134C23.3547 25.9998 23.5092 25.7168 23.5092 25.7168C23.5116 25.7155 23.5129 25.7142 23.5153 25.713L20.0965 19.6782H11.9082Z" fill="#4285F4"/>
  <path d="M11.9086 19.6782H5.00781C5.04241 20.4985 5.39826 20.9778 5.39826 20.9778L5.65773 21.4281C5.67627 21.4546 5.68739 21.4697 5.68739 21.4697L6.25205 22.461L7.51976 24.6676C7.55683 24.7569 7.60008 24.8386 7.6458 24.9166C7.66309 24.9431 7.67915 24.972 7.69769 24.9972C7.70263 25.0047 7.70757 25.0123 7.71252 25.0198C7.86944 25.2412 8.04489 25.4123 8.22034 25.5469C8.37479 25.6627 8.48847 25.7168 8.48847 25.7168L11.9086 19.6782Z" fill="#1967D2"/>
  <path d="M20.0967 19.6782H26.9974C26.9628 20.4985 26.607 20.9778 26.607 20.9778L26.3475 21.4281C26.329 21.4546 26.3179 21.4697 26.3179 21.4697L25.7532 22.461L24.4855 24.6676C24.4484 24.7569 24.4052 24.8386 24.3595 24.9166C24.3422 24.9431 24.3261 24.972 24.3076 24.9972C24.3026 25.0047 24.2977 25.0123 24.2927 25.0198C24.1358 25.2412 23.9604 25.4123 23.7849 25.5469C23.6305 25.6627 23.5168 25.7168 23.5168 25.7168L20.0967 19.6782Z" fill="#EA4335"/>
  </svg>`,

Dropbox:
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-35.3175 -50 306.085 300"><defs id="defs112"><style id="style110">.cls-1{fill:#0061ff}</style></defs><path id="polygon116" class="cls-1" d="M58.86 75l58.87-37.5L58.86 0 0 37.5z"/><path id="polygon118" class="cls-1" d="M176.59 75l58.86-37.5L176.59 0l-58.86 37.5z"/><path id="polygon120" class="cls-1" d="M117.73 112.5L58.86 75 0 112.5 58.86 150z"/><path id="polygon122" class="cls-1" d="M176.59 150l58.86-37.5L176.59 75l-58.86 37.5z"/><path id="polygon124" class="cls-1" d="M176.59 162.5L117.73 125l-58.87 37.5 58.87 37.5z"/></svg>`,

Dark:
  `<path fill="currentColor" d="M16,6A7,7 0 0 0 9,13A7,7 0 0 0 16,20A7,7 0 0 0 21,18.5A8,8 0 0 1 13,12A8,8 0 0 1 16,6Z"/>
   <circle fill="currentColor" cx="7" cy="8" r="0.8"/>`,

Glass:
  `<rect fill="#aaa" stroke="currentColor" x="3" y="2" width="18" height="2"/>
   <path fill-rule="evenodd" fill="#aaa" stroke="currentColor" d="M4 4h16v16h-16z M6 6h12v12h-12z"/>
   <path fill="none" stroke="currentColor" d="M6 12h12M12 6v12"/>
   <rect fill="#aaa" stroke="currentColor" x="1" y="20" width="22" height="2"/>`,


Expand:
  `<rect x="2" y="2" width="20" height="20" fill="#aaa" stroke="currentColor" stroke-width="0.6"/>
   <path fill="none" stroke="currentColor" stroke-width="1.2" d="M7,7L4,4M17,7L20,4M7,17L4,20M17,17L20,20"/>`,

File:
  `<path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />`,

"Fit Auto": 
  `<path fill="#aaa" d="M9,11H15V8L19,12L15,16V13H9V16L5,12L9,8V11M2,20V4H4V20H2M20,20V4H22V20H20Z" />
   <path fill="currentColor" d="M13,9V15H16L12,19L8,15H11V9H8L12,5L16,9H13M4,2H20V4H4V2M4,20H20V22H4V20Z" />`,

"Fit Height":
  `<path fill="currentColor" d="M13,9V15H16L12,19L8,15H11V9H8L12,5L16,9H13M4,2H20V4H4V2M4,20H20V22H4V20Z" />`,

"Fit None":
  `<path fill="currentColor" d="M15,5H17V3H15M15,21H17V19H15M11,5H13V3H11M19,5H21V3H19M19,9H21V7H19M19,21H21V19H19M19,13H21V11H19M19,17H21V15H19M3,5H5V3H3M3,9H5V7H3M3,13H5V11H3M3,17H5V15H3M3,21H5V19H3M11,21H13V19H11M7,21H9V19H7M7,5H9V3H7V5Z" />`,

"Fit Width":
  `<path fill="currentColor" d="M9,11H15V8L19,12L15,16V13H9V16L5,12L9,8V11M2,20V4H4V20H2M20,20V4H22V20H20Z" />`,

Flatten:
  `<text transform="rotate(0) skewX(0)" y="11" x="5" font-size="14px" font-family="Bravura" fill="currentColor">\ue1d4</text>
   <path stroke="currentColor" fill="#9998" stroke-width=".6" d="M4 12L0 20L24 20L20 12Z"/>
   <path fill="none" stroke="currentColor" stroke-width="0.3" d="M4 12.5L20 12.5M3.5 14L20.5 14M3 15.5L21 15.5M2.5 17L21.5 17M2 18.5L22 18.5M1.5 20L22.5 20"/>
   <text transform="translate(19 16) rotate(130) skewX(40)" y="6px" x="0" font-size="14px" font-family="Bravura" fill="currentColor">\ue1d4</text>`,

"Flute Mirrored":
  `<path fill="none" stroke="currentColor" stroke-width="0.5" d="m12.7,12.3c0.3,0.7 1.6,0.8 2.8,0.8 1.1,-0.8 1.5,-2.3 1.8,-3.57L5.38,8.22V7.4L17.7,8.56c0.2,-0.67 2.1,-0.49 2.5,0.16L23.3,9.05 23,10.3 19.9,9.71c-1.3,2.19-2.6,5.69-4.1,5.89-1.5,-0.1-3.7,-0.2-4.5,-1.1m-1.55,1C8.82,17.9 8.5,21.8 8.5,23.1 6.2,23.3 3.41,24.3 1.1,22.6 1.1,17.5 0.939,10 1.25,9.71 4.57,10.4 6.87,11.7 8.82,13.4 10.8,11.8 11.2,9.54 12.7,9.71c1.6,0-1.4,5.79-2.95,5.79zM9.13,8.71C7.52,11.7 0.939,7.57 0.618,5.27 0.275,1.64 2.44,0.329 4.72,0.329 8.92,1.15 9.96,4.6 9.23,7.57" />`,

"Flute Flipped":
  `<path fill="none" stroke="currentColor" stroke-width="0.5" d="M11.3,12.4C11,13.1 9.69,13.2 8.51,13.2 7.41,12.4 7.01,10.9 6.71,9.59L18.7,8.28V7.46L6.31,8.62C6.11,7.95 4.21,8.13 3.81,8.78L0.706,9.11 1.01,10.4 4.11,9.77c1.3,2.23 2.6,5.73 4.1,5.93 1.48,-0.1 3.69,-0.2 4.49,-1.1m1.6,1c0.9,2.4 1.2,6.3 1.2,7.6 2.3,0.2 5.1,1.2 7.4,-0.5 0,-5.1 0.2,-12.6-0.1,-12.93-3.3,0.73-5.6,2.03-7.6,3.73-2,-1.6-2.4,-3.9-3.9,-3.73-1.61,0 1.4,5.83 3,5.83zM14.9,8.77C16.5,11.8 23.1,7.63 23.4,5.33 23.8,1.7 21.6,0.392 19.3,0.392 15.1,1.21 14.1,4.66 14.8,7.63" />`,

Folder:
  `<path fill="#aaa" stroke="currentColor" stroke-width="1.0" d="M2.3,18.8 4.96,9.88 22.8,10.1 19.9,19m0,0L2.2,18.9V5.14h5.89c2.11,0 1.19,1.42 1.84,1.46l9.97,0.1v3.11" />`,

Free:
  `<path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 12C9 0 14 24 19 12"/>`,

"Full Screen":
  `<path fill="#aaa" stroke="currentColor" stroke-width="0.9"  d="m4.99,18.9 3.1,-3.3m-3.1,0v3.3h3.1m10.21,0-3.1,-3.3m3.1,0v3.3H15.2M5.06,5.18 8.16,8.42M4.99,8.3V5.06h3.1m10.21,0-3.1,3.24m3.1,0V5.06H15.2M8.99,9.01a0.4,0.4 0 0 0-0.4,0.4v5.39a0.4,0.4 0 0 0 0.4,0.4h5.41a0.4,0.4 0 0 0 0.4,-0.4V9.41a0.4,0.4 0 0 0-0.4,-0.4z" />`,

Grid:
  `<text font-size="28px" y="12" x="-9" font-family="Bravura" fill="currentColor">\uee37</text>`,

Guide:
  `<g transform="translate(24, 0) scale(-1, 1) rotate(-20 12 12)"><text font-size="22px" x="2" y="18" font-family="Bravura" fill="currentColor" stroke="currentColor" stroke-width="0.6" style="paint-order:stroke;">\uec46</text></g>`,

"Horizontal Scroll":
  `<path fill="#888" stroke="currentColor" stroke-width="0.6" d="M16.7,9.6H7.48m9.22,5.2H7.48m9.22,2.5H7.37M16.7,12.2H7.48M16.7,6.98H7.37M1.44,20.2a0.545,0.519 0 0 0 0.53,0.5 0.545,0.519 0 0 0 0.52,-0.5H1.97Zm20.46,0.1a0.545,0.519 0 0 0 0.6,0.5 0.545,0.519 0 0 0 0.5,-0.5H22.5ZM1.55,3.92A0.545,0.519 0 0 1 2.07,3.4 0.545,0.519 0 0 1 2.6,3.92H2.07ZM21.8,4.03a0.545,0.519 0 0 1 0.5,-0.52 0.545,0.519 0 0 1 0.6,0.52H22.3ZM21.4,20C15.1,19.3 9.01,19.4 3.12,20M21.4,4.35C15,5.16 9.01,4.75 3.02,4.35M23.4,4V20.3H21.5V4.06ZM3.02,3.92V20.2H1.13V3.98Z" />`,

Inch:
  `<path stroke="currentColor" stroke-width="1.0" d="M1 1h22M1 1v24M6 1v6M12 1v12M18 1v6M23 1v23">`,

Ink:
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:0.6;stroke-linecap:butt;stroke-linejoin:miter;" d="m13.5,16.7c1.3,0.4 3.3,0.5 4.4,0m-6.3,1.6c2.1,0.9 6.3,0.9 8.1,0M16.8,17.9C14.8,13.9 14.2,10.2 4.5,2.98 8.43,6.49 12.7,11 16.8,17.9ZM14,13.6C11.8,13.2 10.4,12.2 9.55,11L9.87,10.3 8.48,10.1C5.05,7.72 4.04,3.78 3.08,1.77 5.26,2.68 7.43,3.63 9.43,4.9L9.57,5.78 10.1,5.41c1.7,1.12 3.5,2.34 4.2,4.12l0.1,1.77 0.5,-0.4c0.5,1.2 0.5,2.1-0.2,2.6m-2.3,8c-1.6,-0.2-1.1,-2.3-0.8,-3.2 0.3,-0.9 1.1,-1.5 1.9,-1.6 0,-1 0.2,-1.4 0.4,-1.6 1,-0.1 2.2,-0.2 3.5,0 0.5,0.5 0.4,1 0.5,1.6 0.9,0 1.5,0.7 1.8,1.6 0.3,0.9 0.6,3.1-0.8,3.2-1.4,0.1-4.9,0.2-6.5,0z"/>`,

Jpg:
  `<rect width="24" height="24" rx="2" fill="#aaa" />
   <text y="14" x="8" font-family="Bravura" font-size="12px">\ueb1b</text>
   <text y="22" x="4.5" font-size="6px">JPEG</text>`,

Keyboard:
 `<g style="fill:none;stroke:currentColor;stroke-width:0.6">
  <!-- paper -->
  <path d="M5 1h14v6H5z"/>
  
  <!-- Platen and Symmetric Knobs -->
  <path d="M2.5 7h19"/>
  <rect x=".25" y="6" width="2" height="4" fill="black"/>
  <rect x="21.5" y="6" width="2" height="4" fill="black"/> 
  <!-- strike -->
  <path d="M11 11.5l.5-3 M13 11.5l-.5 -3"/>
  <!-- carriage return -->
  <path d="M0 5 Q 2 2 3 4 L3.5 6.5"/>

  <!-- Symmetric Body with Centered U-Cutout -->
  <!-- path d="M1 11v8a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3v-8c0-2-1-3-3-3h-5v1a3 3 0 0 1-6 0V8H4c-2 0-3 1-3 3z" /-->
     <path fill="#aaa" d="M1 11v8 a3 3 0 0 0 3 3h16 a3 3 0 0 0 3-3v-8 c0-2-1-3-3-3 h-2.5  v1 a3 1.5 0 0 1-11 0 V8 H4   c-2 0-3 1-3 3z" />
  <!-- Balanced Circular Keys -->
  <g fill="black">
  <circle cx="3" cy="13.5" r="0.8"/>
  <circle cx="6.6" cy="13.5" r="0.8"/>
  <circle cx="10.2" cy="13.5" r="0.8" />
  <circle cx="13.8" cy="13.5" r="0.8" />
  <circle cx="17.4" cy="13.5" r="0.8" />
  <circle cx="21" cy="13.5" r="0.8" />
  
  <circle cx="4.8" cy="16.5" r="0.8" />
  <circle cx="8.4" cy="16.5" r="0.8" />
  <circle cx="12" cy="16.5" r="0.8" />
  <circle cx="15.6" cy="16.5" r="0.8" />
  <circle cx="19.2" cy="16.5" r="0.8" />
  </g>

  
  <!-- Spacebar -->
  <rect x="8" y="19.5" width="8" height="1.2" rx="0.5" />
  <rect x="8" y="19" width="8" height="1.2" rx="0.5" />
  </g>`,


Layout:
  `<path fill="none" stroke="currentColor" stroke-width="0.8" d="m12.1,1.82v2.13m0,8.35v3.9M16.8,11A3.88,4.91 86.2 0 1 11.9,14.3 3.88,4.91 86.2 0 1 7.09,11.1M11.4,8.08C10.3,7.89 9.88,6.88 9.99,5.76 10.1,4.65 11.1,3.81 12.2,3.84c1.1,0 2,0.92 2.1,2.04 0,1.11-0.4,2-1.5,2.13M4.97,21 12.2,7.03 19.8,21"/>`,

Light:
  `<path fill="currentColor" d="M16,6A7,7 0 0 0 9,13A7,7 0 0 0 16,20A7,7 0 0 0 21,18.5A8,8 0 0 1 13,12A8,8 0 0 1 16,6Z"/>
   <circle fill="currentColor" cx="7" cy="8" r="0.8"/>`,

Local:
  `<path fill-rule="evenodd" fill="#aaa" stroke="currentColor" stroke-width="1.2" d="m6.22,13.5v2.8M5.39,13.5v2.8M6.35,5.65V8.47M5.5,5.66v2.85m5.4,3.99-2.03,2m7.43,-7.19-2,2m-0.2,3.19 2,2M8.87,7.29 10.9,9.25m3.7,1.55a2.09,2.22 0 0 1-2.1,2.2 2.09,2.22 0 0 1-2.1,-2.2 2.09,2.22 0 0 1 2.1,-2.22 2.09,2.22 0 0 1 2.1,2.22m-9.51,9.5v1.8h2.2V20.3M5.97,4.49H19V17.8H5.73ZM3.57,20.1V2.13H21.5V20.2Zm14.23,0.2v1.8H20v-1.8" />`,

"L-R":
  `<path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 12h21M8 8l-4 4l4 4M19 8l4 4l-4 4"/>`,

Magnify:
  `<defs><mask id="glass">
    <rect x="0" y="0" width="24" height="24" fill="white"/>
    <circle cx="9" cy="9" r="5.2" fill="black"/>
    </mask></defs>
    <path stroke="currentColor" stroke-width=".3" fill="#aaa" d="M12.1 14.4L20 20L21 18.9L14.4 12.2Z"/>
    <circle  mask="url(#glass)" cx="9" cy="9" r="6.1" fill="#aaa" stroke="currentColor" stroke-width=".3"/>
    <circle  mask="url(#glass)" cx="9" cy="9" r="5.3" fill="#aaa" stroke="currentColor" stroke-width=".3"/>`,

Mark:
  `<path style="fill:currentColor;stroke:currentColor;stroke-width:0.8;" d="M8,3L8,21L12,17L16,21L16,3Z"/>`,

Menu:
  `<g fill="none" stroke="currentColor" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round">
     <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
     <circle cx="12" cy="12" r="7" />
     <path d="M13.1,10.1L15.5,5.94M14.2,12L19,12M13.1,13.9L15.5,18.06M10.9,13.9L8.5,18.06M9.8,12L5,12M10.9,10.1L8.5,5.94"/>
     <circle cx="12" cy="12" r="11"/>
     <path d="M16.95,7.05L19.78,4.22M16.95,16.95L19.78,19.78M7.05,16.95L4.22,19.78M7.05,7.05L4.22,4.22"/>
  </g>`,


//   <path style="fill:#ccc;stroke:currentColor;stroke-width:0.3" d="M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>

Merge:
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 5h17v17.5h-17Z"/>
   <path style="fill:#ccc;stroke:currentColor;stroke-width:0.3" d="M5.5 8h12M5.5 14h12 M5.5 20h12"/>
   <g transform-origin="center" transform="rotate(-90)">
     <text x="5.5" y="19" style="fill:currentColor;font-family:Bravura;font-size:12">\uE635</text>,
     <text x="12" y="19" style="fill:currentColor;font-family:Bravura;font-size:12">\uE635</text> 
   </g>`,

Metric:
  `<path stroke="currentColor" stroke-width="1.0" d="M1 1h22M1 1v24M5 1v6M9 1v6M13 1v6M17 1v6M21 1v12">`,

Metronome: 
  `<g stroke-width=".8">
   <rect x="7.5" y="21" width="2" height="1.5" fill="currentColor"/>
   <rect x="15.5" y="21" width="2" height="1.5" fill="currentColor"/>
   <rect fill="#aaa" stroke="currentColor" x="11.5" y="3.5" width="1" height="9.5"/> <!-- gauge -->
   <path fill="#aaa" stroke="currentColor" d="M7,15 L10,15 Q12 11.7 14,15 L17.5,15 L19,21 L6,21 L7,15" /> <!-- base -->
   <path fill="#aaa" stroke="currentColor" d="M10.25,2 Q12 0 13.75,2 Z"/>  <!-- hat -->
   <path fill="none" stroke="currentColor" d="M7,15 L10 2 M17.5,15 L14,2" /> <!-- sides -->
   <path fill="none" stroke="currentColor" d="M12,14.5 6,5 "/> <!-- arm -->
   <circle fill="currentColor" cx="7.35" cy="7.25" r="1"/> <!-- slider -->
   </g>
`,

Mike:
  `<path fill="none" stroke="currentColor" stroke-width="0.6" d="m16.5,20.1c0,0.8-1.8,1.2-4.4,1.2-2.7,0-4.7,-0.4-4.7,-1.2 0,-0.7 2,-1.1 4.7,-1.1 2.6,0 4.4,0.4 4.4,1.1zM12.3,15.6V20m3.8,-9.8h1.5m-10.61,0H8.62M15.2,4.37c-0.8,1.22-5.1,1.07-5.92,0m6.82,4.92c-1.3,1.51-6.42,1.31-7.48,0m7.48,1.51c-1.3,1.5-6.42,1.3-7.48,0M17.2,8.49c0,2.61-0.4,5.21-1,6.01-1.3,1.5-6.66,1.3-7.85,0C7.69,13.9 7.42,11.2 7.42,8.56m1.86,5.34c-0.93,-1.1-0.93,-8.44 0,-9.71 0.92,-1.29 4.92,-1.33 5.92,0 1.3,1.32 1.1,8.61 0,9.71-0.8,1-5,0.9-5.92,0z"/>`,

Mirror:
  `<path fill="none" stroke="currentColor" stroke-width="1.2" d="M18.5,9.3H22M2.53,9.3H5.6M8.2,21.6H16M7.1,22H17M12.1,17.6V22M20,6.8c1.2,3.4 0,7.2-3,9.2-2.8,2-6.6,2-9.4,0C4.61,14 3.34,10.2 4.5,6.8m13.8,2.24c0.1,3.66-3,6.56-6.5,6.36-3.32,-0.1-5.96,-2.9-5.91,-6.36 0,-3.3 2.63,-6 5.91,-6.1 3.5,-0.2 6.5,2.6 6.5,6.1z"/>`,

More:
  `<circle style="fill:currentColor;" cx="12" cy="6" r="2"/>
   <circle style="fill:currentColor;" cx="12" cy="12" r="1.75"/>
   <circle style="fill:currentColor;" cx="12" cy="18" r="1.5"/>`,

"New Folder":
  `<path fill="#aaa" stroke="currentColor" stroke-width="1.0" d="M15.3,12.7A4.42,4.06 0 0 1 10.9,16.8 4.42,4.06 0 0 1 6.48,12.7 4.42,4.06 0 0 1 10.9,8.64 4.42,4.06 0 0 1 15.3,12.7ZM10.9,9.73V15.7M7.98,12.6H14M2.2,18.9V5.14h5.89c2.11,0 1.19,1.42 1.84,1.46l9.97,0.1v12.1z" />`,

"New Page":
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 2h17v20.5h-17Z"/>
   <path style="fill:none;stroke:currentColor;stroke-width:0.3" d="M5.5 5h12M5.5 8h12M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>
   <rect x="7" y="9" width="9" height="6.5" fill="#aaa" stroke="none"/>
   <text x="7.5" y="15.5" style="font-size:11">\u2295</text>`,

"New Score":
  `<path fill="none" stroke="currentColor" stroke-width=".4" stroke-linecap="square" d="m8.45,15.1v0.2m0,0.8v0.2M6.12,15.7c-0.68,0.4-0.68,-1.1 0.48,-0.9 0.83,0 0.96,0.4 1.04,0.9 0.13,1-0.9,2-2.1,2.6v0M6.79,9.67c0.8,-0.2 1.3,-0.8 0.9,-1.6-0.5,-0.8-1.1,-0.7-1.6,-0.3-0.7,0.6-0.1,1.3 0.2,1.3v0M5.69,11c0.3,1.3 1.3,0.8 1.3,0-0.2,-2.03-0.4,-3.93-0.4,-5.93 0,-0.4 0.3,-0.9 0.5,-1 0.9,0.2 0.4,1.9-0.5,2.3-2.3,1-2.2,3.2 0.3,3.3M2.82,18.7c19.98,0 19.98,0 19.98,0v-0.1 0M2.82,17.7c19.98,0 19.98,0 19.98,0v-0.1 0M2.82,16.8c19.98,0 19.98,0 19.98,0v-0.2 0M2.82,15.7c19.98,0 19.98,0 19.98,0v-0.2 0M2.82,14.7c19.98,0 19.98,0 19.98,0v-0.2 0M3.04,9.57c19.76,0 19.76,0 19.76,0v-0.11 0M3.03,8.75c19.77,0 19.77,0 19.77,0v-0.29 0M3.03,7.65c19.77,0 19.77,0 19.77,0v-0.21 0M3.03,6.6c19.77,0 19.77,0 19.77,0v-0.21 0M3.03,5.51c19.77,0 19.77,0 19.77,0v-0.19 0m-19.71,0c0,13.38 0,13.38 0,13.38H2.97v0M2.12,4.72c-1.795,2.14 0.76,3.34-0.86,7.68 1.6,4.5-0.859,6.3 1.03,7.5" />`,

"Next Mark":
  `<path fill="#aaa" stroke="currentColor" stroke-width=".6" d="M5.92,15.9H14.9M5.92,12.3H15M5.92,8.63H15M5.92,5H15M17.3,1.88V18.4L3.83,18.3 3.71,1.89Zm0.2,1.59h2.4V20L6.43,19.9V18.6M19.9,5.18h2.5V21.8L8.76,21.6v-1.5" />,
  <text y="15" x="7" style="font-size:33px;transform:translate(-12px,2px);">\u2194</text>`,

"Next Page":
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 2h17v20.5h-17Z"/>
  <path style="fill:none;stroke:currentColor;stroke-width:0.3" d="M5.5 5h12M5.5 8h12M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>,
 <text y="15" x="7" style="font-size:33px;transform:translate(-12px,2px);">\u2194</text>`,

"No Ink":
  `<path style="fill:none;stroke:currentColor;stroke-width:0.6;stroke-linecap:butt;stroke-linejoin:miter;" d="m13.5,16.7c1.3,0.4 3.3,0.5 4.4,0m-6.3,1.6c2.1,0.9 6.3,0.9 8.1,0M16.8,17.9C14.8,13.9 14.2,10.2 4.5,2.98 8.43,6.49 12.7,11 16.8,17.9ZM14,13.6C11.8,13.2 10.4,12.2 9.55,11L9.87,10.3 8.48,10.1C5.05,7.72 4.04,3.78 3.08,1.77 5.26,2.68 7.43,3.63 9.43,4.9L9.57,5.78 10.1,5.41c1.7,1.12 3.5,2.34 4.2,4.12l0.1,1.77 0.5,-0.4c0.5,1.2 0.5,2.1-0.2,2.6m-2.3,8c-1.6,-0.2-1.1,-2.3-0.8,-3.2 0.3,-0.9 1.1,-1.5 1.9,-1.6 0,-1 0.2,-1.4 0.4,-1.6 1,-0.1 2.2,-0.2 3.5,0 0.5,0.5 0.4,1 0.5,1.6 0.9,0 1.5,0.7 1.8,1.6 0.3,0.9 0.6,3.1-0.8,3.2-1.4,0.1-4.9,0.2-6.5,0z"/>`,

"Not Pdf": 
  `<rect width="24" height="24" rx="2" fill="#aaa" />
   <text y="12" x="9" font-family="Bravura" font-size="10px">\ue01a\ue01a\ue01a</text>
   <text y="12.125" x="9.75" font-family="Bravura" font-size="10px">\ue050</text>
   <text y="22" x="6" font-size="6px">PDF</text>
   <path stroke="currentColor" stroke-width=".9" d="M0 0l24 24M24 0l-24 24"/>`
,

Numbers:
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 2h17v20.5h-17Z"/>
   <path style="fill:none;stroke:currentColor;stroke-width:0.3" d="M5.5 5h12M5.5 8h12M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>
   <rect x="7" y="6" width="9" height="13.5" fill="#aaa" stroke="none"/>
   <text style="fill:currentColor;font-family:Bravura;" font-size="22" x="9.50" y="21">\uE262</text>`,

OneDrive:
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 5.5 32 20.5"><g id="STYLE_COLOR"><path d="M12.20245,11.19292l.00031-.0011,6.71765,4.02379,4.00293-1.68451.00018.00068A6.4768,6.4768,0,0,1,25.5,13c.14764,0,.29358.0067.43878.01639a10.00075,10.00075,0,0,0-18.041-3.01381C7.932,10.00215,7.9657,10,8,10A7.96073,7.96073,0,0,1,12.20245,11.19292Z" fill="#0364b8"/><path d="M12.20276,11.19182l-.00031.0011A7.96073,7.96073,0,0,0,8,10c-.0343,0-.06805.00215-.10223.00258A7.99676,7.99676,0,0,0,1.43732,22.57277l5.924-2.49292,2.63342-1.10819,5.86353-2.46746,3.06213-1.28859Z" fill="#0078d4"/><path d="M25.93878,13.01639C25.79358,13.0067,25.64764,13,25.5,13a6.4768,6.4768,0,0,0-2.57648.53178l-.00018-.00068-4.00293,1.68451,1.16077.69528L23.88611,18.19l1.66009.99438,5.67633,3.40007a6.5002,6.5002,0,0,0-5.28375-9.56805Z" fill="#1490df"/><path d="M25.5462,19.18437,23.88611,18.19l-3.80493-2.2791-1.16077-.69528L15.85828,16.5042,9.99475,18.97166,7.36133,20.07985l-5.924,2.49292A7.98889,7.98889,0,0,0,8,26H25.5a6.49837,6.49837,0,0,0,5.72253-3.41556Z" fill="#28a8ea"/></g></svg>`,

Open:
  `<path style="fill:#aaa;fill-rule:nonzero;stroke:currentColor;stroke-width:0.6;" d="M3.48,2.04 9.64,3.99 21.1,3.03 14.8,1.29ZM3.55,2.1 3.84,16.5 9.78,21.2 9.63,3.98ZM9.8,21.3 9.58,21.7v1.1L21.4,20.3v-1L21.1,18.9ZM3.85,16.5 3.56,17v0.8l6,5V21.7L9.77,21.2ZM9.64,3.99 21.1,3.06V18.9L9.89,21.2Z" />
  <path style="fill:var(--menu-drawer-front);fill-rule:nonzero;stroke:currentColor;stroke-width:0.6;" d="m10.7,4.94v7.36l9.9,-1.6-0.1,-6.66zm4.1,9.86c0.1,0.4 0.6,0.7 1.4,0.5 0.7,-0.2 1.1,-0.5 1.1,-0.9 0,-0.3-0.6,-0.6-1.4,-0.4-0.7,0.1-1.1,0.5-1.1,0.8zm-4.1,-1.7v7l9.8,-2v-6.7z" />
  <path style="fill:var(--menu-drawer-front);fill-rule:nonzero;stroke:currentColor;stroke-width:0.6;"  d="m16.9,8.13c0.1,0.4 0.6,0.7 1.4,0.5 0.7,-0.2 1.1,-0.5 1.1,-0.9 0,-0.3-0.6,-0.6-1.4,-0.4-0.7,0.1-1.1,0.5-1.1,0.8zM12.8,5.84v7.46l9.9,-1.6V4.68ZM10.7,7.89V11l2.1,1V8.72Zm0.1,0 2,0.78V7.76Z"/>`,
    
Options:
  `<path fill="none" stroke="currentColor" stroke-width="0.8" d="M14.8,11.7A2.68,2.68 0 0 1 12,14.4 2.68,2.68 0 0 1 9.28,11.7 2.68,2.68 0 0 1 12,9.38 2.68,2.68 0 0 1 14.8,11.7ZM13.1,3.29 10.8,3.32 10.5,6.09 8.71,6.8 6.55,5.05 4.9,6.65 6.66,8.86 5.97,10.2 3.14,10.6v2.2l2.82,0.4 0.72,1.7-1.78,2.1 1.65,1.7 2.19,-1.8 1.76,0.8c0,0 0.4,2.7 0.3,2.7-0.1,0.1 2.3,0.1 2.3,0.1l0.4,-2.8 1.8,-0.8 2.1,1.8 1.7,-1.7-1.7,-2.1 0.6,-1.7 2.8,-0.4V10.6L18,10.2 17.2,8.91 19.1,6.69 17.5,5.06 15.3,6.81 13.5,6.08Z" />`,

Page:
  `<path fill="#aaa" stroke="currentColor" stroke-width=".6" d="M5.92,15.9H14.9M5.92,12.3H15M5.92,8.63H15M5.92,5H15M17.3,1.88V18.4L3.83,18.3 3.71,1.89Zm0.2,1.59h2.4V20L6.43,19.9V18.6M19.9,5.18h2.5V21.8L8.76,21.6v-1.5" />`,

Paste:
  `<g style="transform:translate(-3px,-3px) scale(1.2,1.2);">
  <path style="fill:#aaa;stroke:currentColor;stroke-width:.6;"
  d="m10.5,10.2h3.2v4.9H10.5ZM11,8.62C10.5,8.75 9.93,8.6 9.56,9.22V16.4H14.6V9.24C14.3,8.66 13.7,8.69 13.1,8.61ZM11,7.4h2.1V8.63H11Zm1.1,-2.22c0.3,-0.1 0.7,2.11 0.6,2.22H11.5C11.4,7.24 11.8,5.07 12.1,5.18Z" /></g>`,


"Paste Page":
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:.6" d="M3 2h17v20.5h-17Z"/>
  <path style="fill:none;stroke:currentColor;stroke-width:0.3" d="M5.5 5h12M5.5 8h12M5.5 8h12M5.5 11h12M5.5 14h12M5.5 17h12M5.5 20h12"/>
  <rect x="7" y="7" width="9" height="12.5" fill="#aaa" stroke="none"/>
  <g style="transform:translate(-2px,.5px) scale(1.1,1.1);">
  <path style="fill:#bbb;stroke:currentColor;stroke-width:.6;"
  d="m10.5,10.2h3.2v4.9H10.5ZM11,8.62C10.5,8.75 9.93,8.6 9.56,9.22V16.4H14.6V9.24C14.3,8.66 13.7,8.69 13.1,8.61ZM11,7.4h2.1V8.63H11Zm1.1,-2.22c0.3,-0.1 0.7,2.11 0.6,2.22H11.5C11.4,7.24 11.8,5.07 12.1,5.18Z" /></g>`,


Pause:
  `<path fill="currentColor" d="M14,19H18V5H14M6,19H10V5H6V19Z" />`,

Pdf: 
  `<rect width="24" height="24" rx="2" fill="#aaa" />
   <text y="12" x="9" font-family="Bravura" font-size="10px">\ue01a\ue01a\ue01a</text>
   <text y="12.125" x="9.75" font-family="Bravura" font-size="10px">\ue050</text>
   <text y="22" x="6" font-size="6px">PDF</text>`,

Pedal:
  `<text y="17" x="3" font-size="14px" font-family="Bravura">\ue650</text>`,

"Pedal Up":
  `<text y="18" x="6.5" font-size="20px" font-family="Bravura">\ue655</text>`,

Pen:
  `<path fill="#aaa" stroke="currentColor" stroke-width="0.5" d="m14.9,3.18 1.4,-1.25 5.4,5.26-1.3,1.29zM2.21,20.5C4.18,18.1 5.33,14.7 5.99,10.7 9.09,8.87 12.2,7.09 14.8,4.6L19,8.77c-2.3,2.33-4.2,5.63-6.2,8.93-5.34,0.5-7.49,2.1-9.78,3.6l7.08,-7.1c1,0.1 1.5,-0.9 0.8,-1.6-0.7,-0.6-1.75,0-1.49,0.9z"  />`,


Pencil:
  `<path style="pointer-events:none;" fill="#aaa" stroke="currentColor" stroke-width="0.5" d="M2.36,21.4 2.22,21.8 2.61,21.6M18.7,3.37 20.6,5.39m-2.5,-1.5 2,1.98M17.7,4.33 19.6,6.32M17.2,4.8 19.1,6.77m-2.7,-1.17 2,1.99M3.41,18.6h1.07v0.8h0.85v1.1M2.08,21.9 3.42,18.5 19.7,2.26c1.3,-0.1 2,0.41 2,1.99L5.4,20.5Z" />`,

Piano:
  `<path fill="currentColor" d="M9.74,8.98H13.5L13.3,10.9H9.92ZM4.05,13.3V12.7H19.1v0.6zM3.88,10.6 14.2,4.17 18.5,10.4 15.3,10.5V8.31H7.99v2.19zm-0.6,4.3 0.29,7.4h1.16l0.33,-7.4 3.36,0.2 0.51,6h0.74l0.43,-5.9 8,-0.2 0.5,7.1 0.9,-0.1 0.4,-7.1h0.5V10.4H18.9L14.6,4.05 17.7,1.98 17.5,1.49 2.84,9.96 2.8,14.9Z" />`,

Play:
  `<path fill="currentColor" d="M8,5.14V19.14L19,12.14L8,5.14Z" />`,

Png:
  `<rect width="24" height="24" rx="2" fill="#aaa" />
   <text y="14" x="6" font-family="Bravura" font-size="12px">\ueb1b</text>
   <text y="22" x="6" font-size="6px">PNG</text>`,

Podium:
  `<g transform="translate(1),scale(0.9,0.9)">
   <path  fill="#aaa" stroke="currentColor" stroke-width=".6" stroke-linejoin="round"
   d="M4 23v-3h16v3h1.5h-19ZM7 20v-14h10v14M7 12h-2l-3-10h20l-3 10h-2"/>
   <text x="9.5" y="14" font-family="Bravura" font-size="10px">\ue520</text></g>`,

Print:
  `<path fill="#aaa" stroke="currentColor" stroke-width=".5" d="m14.3,12h2.2M18.6,15.6 17.5,13M6.18,12H7.97M3.37,15.6 5.17,13M11.1,1.96h1M10.7,3.13 11.4,2.57 11.1,2M11.8,3.12 12.4,2.53 12.1,1.96M11.1,6.91 10.6,6.28 11.2,5.88 10.6,5.19 11.1,4.75 10.7,4.18M12.4,6.86 12,6.23 12.6,5.82 12,5.13 12.4,4.69 12.1,4.12m0.8,2.85H9.85V8.83H12.9V8.28L20.8,8.15V7.69L12.9,7.58ZM7.02,8.82H15.7V10.3H7.01ZM8.19,11.6 6.63,14.4H15.3L14.1,11.6ZM3.56,22.9V15.6H18.4V23H16.5V18.6H15.6V17H6.03v1.6H5.14v4.3zM16.6,8.23V13h0.9L17.6,8.24ZM5.14,13V2.1H6.16V3.15H16.6v-1.1h1.1l-0.1,5.57h-1V4.09H6.16V13Z" />`,

Rastrum:
  `<path fill="#aaa" stroke="currentColor" stroke-width=".6" d="M15.6,2.74 17,1.48 22.4,6.75 21.1,8.04ZM0.472,17.8 6.59,10C9.69,8.18 12.9,6.65 15.5,4.16l4.2,4.17C17.4,10.7 15.5,14 13.5,17.3l-7.55,6.2 6.15,-7.6-7.56,6C4.31,22.1 11.1,14 10.6,14.4l-7.49,6.1 6.21,-7.6-7.65,6.2c-0.59,0.5 6.51,-8.2 6.06,-7.8z"/>`,

Refresh:
  `<path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="currentColor"/>`,

Replace:
  `<path fill="none" stroke="currentColor" stroke-width="1.8" d="M2.28,16.6 12.3,5.33 11.2,3.9h5.4v5.72l-1.3,-1.1-5.55,5.98-1.51,-1.3 0.11,6.1 5.15,-0.1-1,-1.6 9.9,-11.03"/>`,

Repeat:
  `<text y="19" x="6.5" font-family="Bravura" font-size="16px" fill="currentColor">\ue040</text>
   <text y="19" x="13.5" font-family="Bravura" font-size="16px" fill="currentColor">\ue041</text>`,

Replay:
  `<text y="18" x="2" font-family="Bravura" font-size="21px">\ueb18</text>`,

Reset:
  `<path fill="none" stroke="currentColor" stroke-width="1.5" d="${circlePath(9,12,12)} M10 2 l4 0 M12 12 l0 -7 M7 5 l-1.75 -2.25"/>`,


Review:
  `<path fill="#aaa" stroke="currentColor" stroke-width="0.8" d="m14.5,6.73c-1,-1.34-1.9,-0.78-2.5,0m-7.97,0.5c0,2.48 1.73,4.47 3.99,4.47 2.18,0 4.08,-1.95 4.08,-4.47 0,-2.51-1.9,-4.52-4.08,-4.47-2.26,0-3.99,2-3.99,4.47zM14.5,7.03c0,2.52 2,4.57 4.2,4.47 2.2,0 4,-2.01 4,-4.47 0,-2.47-1.8,-4.48-4,-4.48-2.2,-0.11-4.2,1.95-4.2,4.48zm-10.57,0H1.4L10,22.7c0.5,0 0.8,-0.2 0.9,-0.6L1.4,7.05" />`,

Row:
  `<path fill="currentColor" d="M22 20V4C22 2.9 21.1 2 20 2H4C2.9 2 2 2.9 2 4V20C2 21.1 2.9 22 4 22H20C21.1 22 22 21.1 22 20M4 6.5V4H20V6.5H4M4 11V8.5H20V11H4M4 15.5V13H20V15.5H4M4 20V17.5H20V20H4Z" />`,

Save:
  `<path style="fill:#aaa;stroke:currentColor;stroke-width:0.5;fill-rule:nonzero" d="m9.8,21.3-0.22,0.4v1L21.4,20.3v-1L21.1,18.9ZM3.55,2.04 9.64,3.99 21.1,3.03 14.8,1.29ZM3.85,16.5 3.56,17v0.8l5.98,4.9v-1L9.75,21.2ZM3.58,2.06 3.84,16.5 9.78,21.2 9.68,3.97ZM9.77,4.02 9.89,21.2 21.1,18.9V3.06Z"/>
  <path style="fill:var(--menu-drawer-front);stroke:currentColor;stroke-width:0.5;fill-rule:nonzero;" d="m17.2,6.37c0,0.4-0.3,0.76-1.1,0.86-0.7,0.13-1.3,-0.16-1.4,-0.53 0,-0.33 0.5,-0.67 1.1,-0.78 0.8,-0.12 1.4,0.12 1.4,0.45zM10.9,5.06 20.3,4.18v6.72l-9.4,1.4zm0,8.34 9.4,-1.5V18l-9.4,1.9zm6.3,0.9c0,0.3-0.3,0.6-1.1,0.8-0.7,0.1-1.5,0-1.5,-0.5 0,-0.3 0.6,-0.8 1.2,-0.9 0.8,-0.1 1.4,0.1 1.4,0.6z"/>`,

Score:
  `<path fill="#aaa" stroke="currentColor" stroke-width="0.8" d="m14.309339,12.611855v0m-2.543782,-3.2802594 3.122609,-0.01247M1.6649238,22.289353 21.865783,22.478636M18.366179,22.221781 18.066257,3.5141062 20.086952,3.4646895 20.102136,22.20106Zm-1.51175,0.05511-0.560058,-17.6242436 1.367543,0.014358 0.16507,17.6551636zm-6.050171,-0.19639 0.300854,-16.1871633 4.813427,-0.031453 0.02069,16.3211033zM6.1506929,22.108151 11.756662,2.5432418 8.2865928,1.7325439 2.6529156,20.947044Z"/>`,

///
ShowTrace:
  `<path fill="none" stroke="#000" stroke-width="0.5" transform="scale(1.6,1.6) translate(-5,-7)"
d="M 8.81,14.16 c 1.97,-0.09 2.34,-3.49 3.07,-6.21 l -0.02,8.30 M 11.86,16.24 c 0.14,-2.46 3.70,0.77 3.56,-0.40 M 15.42,15.86 C 14.23,11.41 10.01,17.58 8.30,15.07 M 8.30,15.07 c -0.35,-0.28 -0.59,-0.84 -0.84,-1.34 0.42,0.23 0.87,0.45 1.36,0.42"/>`, 

HideTrace:
  `<path fill="none" stroke="#aaa" stroke-width="0.5" transform="scale(1.6,1.6) translate(-5,-7)"
d="M 8.81,14.16 c 1.97,-0.09 2.34,-3.49 3.07,-6.21 l -0.02,8.30 M 11.86,16.24 c 0.14,-2.46 3.70,0.77 3.56,-0.40 M 15.42,15.86 C 14.23,11.41 10.01,17.58 8.30,15.07 M 8.30,15.07 c -0.35,-0.28 -0.59,-0.84 -0.84,-1.34 0.42,0.23 0.87,0.45 1.36,0.42"/>`, 

Slope:
  `<path fill="none" stroke="currentColor" stroke-width="1.8" d="M5 5l19 19M5 10v-5h5M18 23h5v-5"/>`,

Speaker:
  `<path fill="none" stroke="currentColor" stroke-width="0.6" d="m10.9,18.3 6.6,-0.2m-2.4,-5c0,0.7-0.5,1.2-1.1,1.2-0.6,0-1.1,-0.5-1.1,-1.2 0,-0.7 0.5,-1.2 1.1,-1.2 0.6,0 1.1,0.5 1.1,1.2zm2.1,0.1c0,1.8-1.3,3.3-3,3.3-1.7,0-3,-1.5-3,-3.3 0,-1.8 1.3,-3.32 3,-3.3 1.7,-0 3,1.5 3,3.3zM15.1,6.61c0,0.49-0.4,0.87-0.8,0.87-0.4,-0.1-0.7,-0.42-0.7,-0.87 0,-0.46 0.3,-0.86 0.7,-0.91 0.4,0 0.8,0.4 0.8,0.91zm0.7,0c0,0.94-0.7,1.69-1.5,1.66-0.8,-0-1.4,-0.77-1.4,-1.66 0,-0.89 0.6,-1.63 1.4,-1.66 0.8,-0 1.5,0.72 1.5,1.66zM11.1,9.8c1.5,-0.84 3.7,-0.95 6,0.1 0.8,1.7 1.3,4.2 0.2,6.7-1.9,0.9-3.8,0.6-6.2,0.1-0.9,-1.9-1.12,-3.9 0,-6.9zM9.13,19.3 5.54,18.4V6.16L9.27,3.3m0.1,0 9.23,1.25 0.2,14.55-9.55,0.2z"/>`,

Split:
  `<path fill="none" stroke="currentColor" stroke-width="1.5" d="${circlePath(9,12,12)} M10 2 l4 0 M12 12 l-3 5.5 M12 12 l-2 -6 M12 12 l4 0 M17 5 l1.75 -2.25" />`,

Start:
  `<path fill="currentColor" d="M13,3H11V13H13V3M17.83,5.17L16.41,6.59C18.05,7.91 19,9.9 19,12A7,7 0 0,1 12,19C8.14,19 5,15.88 5,12C5,9.91 5.95,7.91 7.58,6.58L6.17,5.17C2.38,8.39 1.92,14.07 5.14,17.86C8.36,21.64 14.04,22.1 17.83,18.88C19.85,17.17 21,14.65 21,12C21,9.37 19.84,6.87 17.83,5.17Z" />`,

Stop:
  `<path fill="currentColor" d="M15,16H13V8H15V16M11,16H9V8H11V16M15.73,3L21,8.27V15.73L15.73,21H8.27L3,15.73V8.27L8.27,3H15.73M14.9,5H9.1L5,9.1V14.9L9.1,19H14.9L19,14.9V9.1L14.9,5Z" />`,

Stopwatch:
  `<path fill="#aaa" stroke="currentColor" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" d="m11.9,13 3.2,1.7M8.35,7.28 7.74,5.99M6.04,9.72 4.8,8.96M5.82,16.3 4.77,16.9M8.3,18.7 7.7,20m7.2,-1.1 0.6,1m1.9,-3.6 1.2,0.7M17.4,9.8 18.7,9.05M15.1,7.33 15.8,6.08m-4,-2.16V4.46M3.7,12.9H5.13M11.8,4.93V6.36M11.6,19.7v1.4M18.4,13h1.4m-8,-7.23V13L6.42,17.9M9.49,3.85V2.13H13.9V3.9ZM17.3,6.43 18,5.6 19.2,6.63 18.3,7.61M5.1,7.6 4.15,6.68 5.36,5.51 6.25,6.4M20.3,13A8.57,8.57 0 0 1 11.7,21.6 8.57,8.57 0 0 1 3.13,13 8.57,8.57 0 0 1 11.7,4.43 8.57,8.57 0 0 1 20.3,13Z" />`,

Storage:
  `<path d="M2 5h20v14h-8v-1.5h-1.5v1.5H2v-5a2 2 0 0 0 0-4V5z" fill="none" stroke="currentColor" stroke-width="0.8"/>
   <rect x="6" y="7.5" width="5" height="7" rx="0.5" fill="#aaa" stroke="currentColor" stroke-width="0.8"/>
   <rect x="15" y="7.5" width="5" height="7" rx="0.5" fill="#aaa" stroke="currentColor" stroke-width="0.8"/>
   <path d="M6.5 7.5v-1.5M8.5 7.5v-1.5M10.5 7.5v-1.5M6.5 14.5v1.5M8.5 14.5v1.5M10.5 14.5v1.5" stroke="currentColor" stroke-width="0.6"/>
   <path d="M15.5 7.5v-1.5M17.5 7.5v-1.5M19.5 7.5v-1.5M15.5 14.5v1.5M17.5 14.5v1.5M19.5 14.5v1.5" stroke="currentColor" stroke-width="0.6"/>
   <path d="M2 17h10.5M14 17h8" stroke="currentColor" stroke-width="0.5"/>
   <path d="M4 19v-2M6 19v-2M8 19v-2M10 19v-2M16 19v-2M18 19v-2M20 19v-2" stroke="currentColor" stroke-width="0.6"/>`,

Stretch:
  `<text y="10" x="6" font-size="10px" font-family="Bravura">\ue512</text>
   <text y="22" x="1" font-size="24px">\u21d4</text>`,

Symbols:
  `<text y="15" x="7" font-size="13px" font-family="Bravura" fill="currentColor">\ue050</text>`,

Table:
  `<path fill="#999" stroke="currentColor" stroke-width="0.5" fill-rule="nonzero" d="M22.8,3.78C22.6,4.12 22.3,4.46 22.4,4.8M17,5.25V6.02M2.4,4.17C2.49,3.91 2.22,3.65 2.04,3.39L7.79,2.03 22.9,3.81 17,5.12 2.09,3.45v0M20.5,7.44c-0.4,1.58 0.6,7.66 0.4,11.26 0.2,0.5-0.4,1.2 0.4,1.5 0.5,0.3 0.5,0.7 1.2,-0.4 0.3,-0.4-0.2,-0.7-0.5,-1.5-0.5,-4 1.2,-8 0.4,-11.4M17,6.21 2.41,4.19V6.52M17,8.51 22.4,6.84V4.82L17,6.16ZM14.9,8.26c0.7,0.47 1,1.15 1.1,2.44 0.8,3.6 0.6,7.1 0.7,10.7-0.1,0.7 0.3,0.7 0.7,0.8 0.4,-0.1 0.4,-0.3 0.5,-0.5C17.8,19 17.1,18.3 18.4,10.6 18.5,10.1 18.6,8.88 19,7.91M9.01,7.63C8.45,10 8.51,13.1 8.6,15.8c0,1.1-0.1,1.1-0.76,1C7.46,16.8 7.6,16.1 7.6,15.6 7.39,12.8 7.29,8.91 6.11,6.92M5.09,6.81C4.35,8.45 4.4,13.9 4.39,17.4c0,1.2 0.89,1.2-1.1,1.3-0.37,0-0.55,-0.9 0.18,-1.5C3.8,12.1 1.75,8.65 2.53,6.48l14.37,2.1">`,

Warm:
 `<circle fill="currentColor" cx="12" cy="12" r="4"/>
   <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M12,2.5v2M12,19.5v2M21.5,12h-2M4.5,12h-2M18.4,5.6l-1.4,1.4M7,17l-1.4,1.4M18.4,18.4l-1.4-1.4M7,7L5.6,5.6"/>`,

Text:
  `<text x="0" y="16" font-size="12px" fill="currentColor">Abc</text>` ,

Trash:
  `<path fill-rule="evenodd" style="pointer-events:none;" transform="scale(.6) translate(6,8)" fill="#aaa" stroke-linecap="round" stroke="currentColor" stroke-width="0.8" d="M-4-2h32l-4 32h-24l-4-32l1-2h30l1 2M8-4v-3h8v3"/>,
  <path fill-rule="evenodd" style="pointer-events:none;" transform="scale(.6) translate(6,9.5)" fill="#ccc" stroke-linecap="round" stroke="currentColor" stroke-width="0.8" d="m13.7,7.93-1.5,0.6h4.4l1.8,-3.2-1.2,0.5-1.2,-1.1c-0.3,-0.3-0.6,-0.6-0.8,-0.6l-4.4,-0.3 0.9,0.9zM6.97,7.33 8.65,4.77C9.82,3.57 11.2,4.62 11.4,5L12,6.14 10,9.33ZM8.67,12.4 10,12.9 7.87,9.33h-3.9l1.5,0.97-0.9,1.8c-0.3,0.3-0.3,0.8-0.3,1.1l2.1,3.9 0.3,-1.2zm3.03,6.1-3.33,0.3c-1.7,-0.6-1.7,-2.3-1.4,-2.6l0.8,-1.5h3.93zm3.2,-3.8v-1.5l-2.1,3.6 2.1,3.4v-1.4h2c0.6,0 0.6,-0.3 0.9,-0.6l2.1,-3.8-0.9,0.3zm3.8,-5.87 1.8,2.97c0.5,1.7-0.9,2.6-1.5,2.6h-1.5l-2.3,-3.8z"/>`,

TuningFork:
  `<path style="fill:currentColor;transform:scale(.7) translate(5px,6px)" d="M1.102562,22.391872 6.8926979,15.709595 6.4539927,13.040411C10.3489,8.9372266 14.277758,6.993404 18.138714,0.73085919L19.512348,1.8269521 9.6277644,12.418518c-1.0080639,1.850254 1.3131146,2.290741 1.8170396,1.541383L21.384356,3.4582128 22.59468,4.5620395C18.53232,6.6557468 14.903386,13.08682 11.057739,17.349209L8.3613917,16.885233 2.0669863,23.230394C1.6842162,23.407502 1.017983,22.79385 1.1025502,22.391852Z"/>`,

"T-B":
  `<path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 4v21M8 8l4-4l4 4M8 19l4 4l4-4"/>`,

Undo:
  `<text font-size="20px" y="16" x="6" fill="currentColor" stroke="currentColor" font-family="Bravura">\uedf0</text>`,

Upload:
  `<path fill="#aaa" stroke="currentColor" stroke-width=".2" d="M12.4,17.9C19.2,1.58 11.5,1.8 11.1,1.02 13.2,4.76 12.3,11.2 11.4,17.9Zm-2.79,0C2.91,1.57 10.7,1.79 11.1,1.02 8.91,4.74 9.71,11.2 10.8,17.9Z" />`,

"Vertical Scroll":
  `<path fill="#888" stroke="currentColor" stroke-width="0.6" d="M6.63,14.7H17.5M6.63,9.85H17.5M6.63,7.4H17.6M6.63,12.3H17.5M6.63,17.2H17.6m4,5.2a0.607,0.519 0 0 0 0.6,-0.5 0.607,0.519 0 0 0-0.6,-0.5v0.5zM21.7,2.95A0.607,0.519 0 0 0 22.3,2.43 0.607,0.519 0 0 0 21.7,1.91V2.43ZM2.52,22.3A0.607,0.519 0 0 1 1.9,21.8 0.607,0.519 0 0 1 2.52,21.3v0.5zM2.64,3.05A0.607,0.519 0 0 1 2.04,2.53 0.607,0.519 0 0 1 2.64,2.01V2.53ZM21.4,3.38c-0.9,6.05-0.8,11.82 0,17.42M3.02,3.42c0.94,6.09 0.46,11.78 0,17.48M2.61,1.55H21.7V3.33H2.67ZM2.52,20.9H21.6v1.8H2.58Z"/>`,

Void:
   `<path d=""/>`,

Volume:
   `<text y="13" x="6" font-size="16px" font-family="Bravura" fill="currentColor">\ue534</text>`,

Video:
  `<path fill="none" stroke="currentColor" stroke-width="0.6" d="m14,16.6 3.8,-0.9M10.3,3.42c1.5,0.44 2.3,0.5 2.4,1.18L16.3,4.11C15.9,3.58 14.8,3.16 13.4,3.15ZM7.92,14.9 8.2,14.2 9.38,15.1 9.29,16ZM4.31,6.48C4.27,7.12 3.85,7.6 3.38,7.56 2.92,7.52 2.59,6.99 2.63,6.37c0,-0.63 0.45,-1.12 0.92,-1.08 0.46,0 0.8,0.56 0.76,1.19zM3.9,11.6 2.39,11.5v1.7l1.61,1.3 2.27,1v-2zM18.6,9.78V8.6l-5.9,1.1v9.7l5.9,-1.7V15M16,5.92 13.3,6.3V8.99L16,8.49Zm4.9,9.48c-1.4,-0.2-2.8,-0.3-4.5,-1m5.7,-3.6C20.9,10.3 19.9,10 18.4,9.8m3.6,1.4c-0.6,-0.1-1.1,0.2-1.5,0.5-0.3,0.5-0.5,1-0.5,1.5 0,0.4 0.1,0.8 0.3,1.2 0.2,0.3 0.5,0.6 0.9,0.6 0.9,0 1.7,-0.8 1.7,-1.8 0,-0.4 0,-0.9-0.2,-1.3 0,-0.3-0.4,-0.6-0.7,-0.7zm0,0.2c0.3,0 0.5,0.3 0.7,0.6 0,0.3 0,0.8 0,1.2 0,0.8-0.8,1.6-1.5,1.6-0.4,0-0.7,-0.1-0.8,-0.5-0.2,-0.3-0.2,-0.7-0.2,-1.1 0,-0.4 0.2,-0.9 0.5,-1.3 0.2,-0.4 0.8,-0.6 1.3,-0.5zm0,-0.7c-0.7,-0.1-1.3,0.2-1.8,0.7-0.4,0.6-0.7,1.2-0.7,1.8 0,0.6 0.1,1.1 0.4,1.6 0.3,0.4 0.7,0.7 1.2,0.7 1.1,0 2.1,-1 2.2,-2.2 0,-0.6 0,-1.2-0.2,-1.7-0.2,-0.4-0.6,-0.8-1.1,-0.9zm0,0.2c0.4,0.1 0.7,0.4 0.9,0.8 0.2,0.4 0.2,1 0.2,1.6-0.1,1-1.1,2-2,2-0.5,0-0.8,-0.2-1,-0.6-0.3,-0.4-0.4,-1-0.4,-1.5 0,-0.5 0.3,-1.1 0.7,-1.6 0.4,-0.5 1,-0.8 1.6,-0.7zm-5.4,3.6C15.4,13.9 15.1,12.4 15.5,11.1 16,10 17.1,9.5 18.4,9.8m0.7,5.3v3.1C19,18.5 19,18.6 18.9,18.6l-7.4,2.3M19,4.64V9.89M1.7,3.35 9.35,2.03M19,4.69 11.5,5.72M9.31,2.03c3.09,0.93 8.89,0 9.69,2.63M11.5,5.72V20.8C11,21.8 4.84,17.3 1.71,15.5V3.39C4.94,4.32 10.7,3.16 11.5,5.72Z"/>`,

"Wakelock Off":
  `<line x1="11" y1="8" x2="11" y2="9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
   <rect x="7.5" y="9.5" width="7" height="9" rx="0.8" stroke="currentColor" stroke-width="1.2" fill="none"/>
   <path d="M4 18.5 Q4 21 11 21 Q18 21 18 18.5 L16 18.5 L6 18.5 Z"
     stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>
   <path d="M18 20 Q21 20 21 17.5 Q21 15.5 19 15.5 Q17.5 15.5 17.5 17"
     stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>  
`,

"Wakelock On":
  `<path d="M11 1 C9.5 3 8.5 5 9.5 6.5 C10 7.5 10.5 8 11 8 C11.5 8 12 7.5 12.5 6.5 C13.5 5 12.5 3 11 1Z"
     stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="#fff"/>
   <line x1="11" y1="8" x2="11" y2="9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
     <rect x="7.5" y="9.5" width="7" height="9" rx="0.8" stroke="currentColor" stroke-width="1.2" fill="none"/>
   <path d="M4 18.5 Q4 21 11 21 Q18 21 18 18.5 L16 18.5 L6 18.5 Z"
     stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>
   <path d="M18 20 Q21 20 21 17.5 Q21 15.5 19 15.5 Q17.5 15.5 17.5 17"
     stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
`,

Wave:
  `<defs><mask id="scope"><rect x="0" y="0" height="24" width="24" fill="white"></rect>
    <rect x="0" y="16" height="8" width="24" fill="black"/></mask></defs>
    </def>
    <text mask="url(#scope)" y="24" x="2" font-family="Bravura" font-size="22px">\ueb4a</text>`,

Webcam:
  `<path fill="none" stroke="currentColor" stroke-width="0.6" d="M8.3,18.8C8.48,19.8 6.55,20.9 3.74,22 8.77,20.9 14,20.7 20.2,22 18,21.1 15.8,20.2 15.1,19.1M20,11.5c0,4.5-3.7,8.2-8.2,8.2-4.29,0-7.96,-3.7-7.96,-8.2 0,-4.62 3.67,-8.29 7.96,-8.29 4.5,0 8.2,3.67 8.2,8.29zm-2.7,0.3a2.95,2.95 0 0 1-3,3 2.95,2.95 0 0 1-2.9,-3 2.95,2.95 0 0 1 2.9,-2.69 2.95,2.95 0 0 1 3,2.69zm1.4,0a4.51,4.63 0 0 1-4.5,4.6 4.51,4.63 0 0 1-4.38,-4.6 4.51,4.63 0 0 1 4.38,-4.4 4.51,4.63 0 0 1 4.5,4.4z"/>`,
};

// following code generates a data url to create the podium favicon...uncomment it
// to have it written to console...then copy it to the <head> section of the html.
/*
import { delay, helm } from "./common.js";
let src =
  "data:image/svg+xml;base64," +
  btoa(`<svg width=`12` height=`12` viewBox=`0 0 24 24` xmlns=`http:/\/www.w3.org/2000/svg`>
               <path fill="#fff" stroke="black" stroke-width="1"
              d="M4 23v-3h16v3h1.5h-19.5,M7 20v-14h10v14M7 12h-2l-3-10h20l-3 10h-2"/></svg>`);
let img = helm(`<img src="${src}"></img>`);
document.body.append(img);
delay(50, () => {
  let c = helm(`<canvas style="width:12px;height:12px" height="12" width="12"></canvas>`);
  let ctx = c.getContext("2d");
  document.body.append(c);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, 12, 12, 0, 0, 12, 12);
  delay(50, () => console.log(`<link rel="icon" type="image/png"  href="` + c.toDataURL(`image/png`, 1.0) + `">`));
});
*/


