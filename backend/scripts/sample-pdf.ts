/**
 * Generates a realistic 2-page syllabus PDF for testing the ingest
 * pipeline (OCR → chunk → embed). Run: bun run scripts/sample-pdf.ts
 * Output: scripts/samples/syllabus.pdf
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(import.meta.dir, "samples");
const outPath = path.join(outDir, "syllabus.pdf");

const html = `<!doctype html>
<html><head><meta charset="utf-8"/><style>
  body { font-family: Georgia, serif; font-size: 12px; line-height: 1.6; margin: 40px; color: #111; }
  h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 14px; border-bottom: 1px solid #999; padding-bottom: 3px; margin-top: 22px; }
  .meta { text-align: center; font-size: 11px; color: #444; margin-bottom: 18px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  td, th { border: 1px solid #bbb; padding: 5px 8px; font-size: 11px; }
  th { background: #eee; }
</style></head><body>
<h1>Digital Signal Processing</h1>
<div class="meta">Course Code: EC305 &middot; Department: Electronics &amp; Communication Engineering &middot; Semester 5</div>

<h2>Course Overview</h2>
<p>This course introduces the fundamental concepts of digital signal processing, including discrete-time signals and systems, the z-transform, Fourier analysis, and digital filter design. Students will learn to analyze signals in both the time and frequency domains and implement practical DSP algorithms. The course emphasizes both theoretical foundations and hands-on implementation using Python and MATLAB. By the end of the course, students should be able to design finite impulse response and infinite impulse response filters for real-world applications such as audio processing, image enhancement, and communication systems.</p>

<h2>Learning Outcomes</h2>
<ul>
<li>Analyze discrete-time signals and linear time-invariant systems.</li>
<li>Compute the z-transform and its inverse for common signal sequences.</li>
<li>Apply the discrete Fourier transform and the fast Fourier transform algorithm.</li>
<li>Design and implement FIR and IIR digital filters using windowing and bilinear transform methods.</li>
<li>Evaluate the effects of sampling, aliasing, and quantization on signal fidelity.</li>
</ul>

<h2>Prerequisites</h2>
<p>Signals and Systems (EC204), Linear Algebra (MA201), and basic programming proficiency. The sampling theorem states that a continuous signal must be sampled at a rate greater than twice its highest frequency component to avoid aliasing; this fundamental bound is known as the Nyquist rate.</p>

<h2>Unit 1: Discrete-Time Signals and Systems</h2>
<p>Representation of discrete-time signals, basic operations on sequences, classification of systems as linear or nonlinear, time-invariant or time-varying, causal or non-causal, and stable or unstable. Convolution sum and its properties. Difference equations and their solution using iterative and closed-form methods.</p>

<h2>Unit 2: The z-Transform</h2>
<p>Definition and region of convergence, properties of the z-transform, inverse z-transform via partial fraction expansion and power series. Transfer functions of linear time-invariant systems, poles and zeros, and their relationship to system stability and frequency response.</p>

<h2>Unit 3: Fourier Analysis of Discrete-Time Signals</h2>
<p>The discrete-time Fourier transform, the discrete Fourier transform and its properties, circular convolution, linear convolution using the DFT, and the fast Fourier transform algorithm with radix-2 decimation-in-time and decimation-in-frequency structures. Applications of the FFT in spectral analysis and convolution of long sequences.</p>

<h2>Unit 4: Digital Filter Design</h2>
<p>Design of FIR filters using the window method and frequency sampling, design of IIR filters from analog prototypes using impulse invariance and the bilinear transform, filter structures including direct form, cascade form, and parallel form, and finite word-length effects including quantization error and coefficient sensitivity.</p>

<h2>Unit 5: Applications and Case Studies</h2>
<p>Speech signal processing fundamentals, audio effects including echo and reverb, image filtering using 2D convolution, and an introduction to adaptive filters with the LMS algorithm. A case study on removing noise from audio recordings using a band-pass FIR filter designed in Python.</p>

<h2>Assessment Scheme</h2>
<table>
<tr><th>Component</th><th>Weight</th><th>Details</th></tr>
<tr><td>Mid-Semester Exam</td><td>30%</td><td>Units 1–2, closed book</td></tr>
<tr><td>End-Semester Exam</td><td>50%</td><td>All units, closed book</td></tr>
<tr><td>Assignments</td><td>10%</td><td>4 programming assignments in Python</td></tr>
<tr><td>Lab Work</td><td>10%</td><td>MATLAB/Octave experiments</td></tr>
</table>

<h2>Recommended Textbooks</h2>
<p>1. Oppenheim &amp; Schafer, "Discrete-Time Signal Processing", 3rd Edition, Pearson.<br/>
2. Proakis &amp; Manolakis, "Digital Signal Processing: Principles, Algorithms and Applications", 4th Edition, Pearson.<br/>
3. Mitra, "Digital Signal Processing: A Computer-Based Approach", 4th Edition, McGraw-Hill.</p>

<h2>Faculty</h2>
<p>Dr. Anjali Sharma, Room L203, Electronics Department. Office hours: Tuesday and Thursday, 2:00 PM to 4:00 PM. Email: anjali.sharma@university.edu.in</p>
</body></html>`;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.pdf({ path: outPath, format: "A4", printBackground: true });
} finally {
  await browser.close();
}
console.log(`✅ Sample PDF written to ${outPath}`);
