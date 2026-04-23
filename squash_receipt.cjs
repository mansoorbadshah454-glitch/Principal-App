const fs = require('fs');
const file = 'c:/School V5/principal-app/src/pages/Admission.jsx';
let content = fs.readFileSync(file, 'utf8');

// The replacements target the styles in the receipt modal
content = content.replace(/minHeight: "1100px",/g, 'minHeight: "auto",');
content = content.replace(/padding: "4rem",/g, 'padding: "1.5rem 2rem",');
content = content.replace(/marginBottom: "3rem",/g, 'marginBottom: "1rem",');
content = content.replace(/paddingBottom: "2rem",/g, 'paddingBottom: "1rem",');
content = content.replace(/width: "100px",\s*height: "100px",/g, 'width: "60px",\n                          height: "60px",');
content = content.replace(/margin: "0 auto 1rem",/g, 'margin: "0 auto 0.5rem",');
content = content.replace(/fontSize: "2rem",/g, 'fontSize: "1.5rem",');
content = content.replace(/gap: "2rem",/g, 'gap: "1rem",');
content = content.replace(/padding: "1.5rem",/g, 'padding: "1rem",');
content = content.replace(/padding: "2rem",/g, 'padding: "1rem",');
content = content.replace(/gap: "3rem",/g, 'gap: "1rem",');
content = content.replace(/paddingTop: "3rem",/g, 'paddingTop: "1rem",');
content = content.replace(/margin: "0 auto 1.5rem",/g, 'margin: "0 auto 0.5rem",');
content = content.replace(/marginBottom: "2.5rem",/g, 'marginBottom: "1rem",');
content = content.replace(/marginBottom: "1.5rem",/g, 'marginBottom: "0.5rem",');
content = content.replace(/fontSize: "1.25rem",/g, 'fontSize: "1rem",');
content = content.replace(/fontSize: "1.2rem",/g, 'fontSize: "1rem",');
content = content.replace(/fontSize: "1.4rem",/g, 'fontSize: "1.1rem",');
content = content.replace(/padding: "1rem 0",/g, 'padding: "0.5rem 0",');
content = content.replace(/fontSize: "1.05rem",/g, 'fontSize: "0.9rem",');

// Also update the print CSS to fix any height/zoom issues
content = content.replace(
  /.admission-receipt {/g,
  `.admission-receipt {\n                zoom: 0.95;\n                page-break-inside: avoid;`
);

fs.writeFileSync(file, content);
console.log('Squashed receipt styling applied successfully.');
