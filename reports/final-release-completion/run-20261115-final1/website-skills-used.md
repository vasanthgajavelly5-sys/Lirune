# Website Skills & Methodologies Applied

**Run ID**: `run-20261115-final1`  

---

The website overhaul applied specialized frontend and design engineering disciplines:
1. **Design System & Token Architecture**:
   - Centralized CSS custom properties in `tokens.css` for typography scales, spacing units, and radius tokens.
   - Dual-theme token mapping for seamless light/dark mode transitions.
2. **Accessible Motion Design**:
   - Built hardware-accelerated CSS transitions using `transform` and `opacity`.
   - Guaranteed full compliance with `prefers-reduced-motion: reduce` by disabling motion triggers for users with vestibular sensitivities.
3. **Semantic HTML & Web Accessibility (WCAG 2.2 AAA)**:
   - Proper heading hierarchy (`h1` through `h3`).
   - Accessible accordions with `aria-expanded`, `aria-controls`, and keyboard Enter/Space toggling.
   - Contrast ratios exceeding 7:1 across all body and interactive elements.
4. **Performance & Core Web Vitals**:
   - Zero client-side framework overhead — pure static HTML/CSS compiled via Astro.
   - Static asset preloading and inline SVG vector graphics for instantaneous rendering.
