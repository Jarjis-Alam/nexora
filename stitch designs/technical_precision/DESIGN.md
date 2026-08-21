---
name: Technical Precision
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.25'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  title-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.5'
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.6'
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 16px
  container-max: 1200px
---

## Brand & Style
The design system is engineered for high-stakes preparation, prioritizing focus, technical rigor, and industrial-grade reliability. The brand personality is "Expert-Modular"—it feels like a professional IDE cross-pollinated with a premium productivity tool.

The visual style is **Modern Minimalist with a Technical Edge**. It utilizes deep obsidian surfaces, razor-sharp alignment, and high-density information display without clutter. The aesthetic avoids all decorative fluff, favoring functional clarity and a sense of "under-the-hood" performance. The goal is to evoke a state of deep work (flow) for engineering students.

## Colors
The palette is built on a "Void and Neon" logic. The primary background (`#0A0A0A`) provides an infinite depth, while secondary surfaces (`#121212`) create subtle structural separation. 

- **Primary (Electric Blue):** Reserved strictly for primary actions, progress indicators, and active states. It acts as a beacon in the dark interface.
- **Success (Emerald):** Used for "Passed" test cases and completed modules.
- **Neutral/Borders:** We use a refined gray scale. Borders at `#262626` create the "Linear-style" structural grid without high-contrast distraction.
- **Typography:** High-contrast white (`#EDEDED`) for content and muted silver (`#A1A1A1`) for metadata and labels to reduce eye strain during long sessions.

## Typography
The system uses **Geist** for all UI and prose elements to maintain a technical, clean, and modern feel. Its tight tracking and geometric clarity mimic the look of elite developer tools.

**JetBrains Mono** is utilized for code snippets, data points, and small labels (`label-xs`). This secondary font reinforces the engineering-centric nature of the platform. Typography should be set with a slight negative letter-spacing for headlines to increase the "premium" feel. Line heights are generous in body text to ensure readability of complex technical explanations.

## Layout & Spacing
This design system follows a **12-column fixed-grid model** for desktop, centered within the viewport. The spacing rhythm is based on a **4px base unit**.

- **Desktop:** 12 columns, 24px gutters, 64px side margins. 
- **Tablet:** 8 columns, 16px gutters, 32px side margins.
- **Mobile:** 4 columns, 16px gutters, 16px side margins.

Component layout should rely on heavy vertical rhythm. Sections are separated by large gaps (64px+) to prevent the dense technical data from feeling overwhelming. Use "Section Groups" with 32px spacing and "Internal Element" spacing of 12px or 16px.

## Elevation & Depth
Elevation is expressed through **Tonal Layering and Low-Contrast Outlines** rather than traditional shadows. 

1. **Level 0 (Base):** `#0A0A0A` - The main background canvas.
2. **Level 1 (Cards/Sections):** `#121212` - Used for primary content containers. These must have a 1px solid border of `#262626`.
3. **Level 2 (Popovers/Modals):** `#1A1A1A` - Slightly lighter to indicate "float." 

**Shadows:** When used for modals, apply a single, very soft, non-blurred black shadow to slightly lift the element from the base, but rely primarily on border contrast.

## Shapes
The shape language is **Soft-Technical**. We use a 4px (0.25rem) default radius for buttons, inputs, and small components. Large cards use an 8px (0.5rem) radius.

This subtle rounding prevents the UI from feeling "aggressive" (like pure 0px Brutalism) while remaining much sharper and more professional than consumer-grade "rounded" or "pill" designs. Interactive states should never change the shape—only the border color or background brightness.

## Components
- **Buttons:** 
  - *Primary:* Electric Blue background, white text, 4px radius. 
  - *Secondary:* Transparent background, `#262626` border, white text. 
  - *Ghost:* No border, muted gray text, turns white on hover.
- **Input Fields:** Dark background (`#0A0A0A`), 1px border (`#262626`). On focus, the border transitions to Electric Blue with no outer glow.
- **Code Editor:** Must use a theme that aligns with the system colors (e.g., a custom "Carbon" theme). Line numbers in `#A1A1A1`.
- **Status Chips:** Small, rectangular with 2px radius. Use a subtle background tint of the status color (e.g., 10% opacity Emerald) with 100% opacity text.
- **Cards:** No shadows. 1px border of `#262626`. Title in `title-md`, metadata in `label-xs`.
- **Data Tables:** Row-based layout with 1px bottom borders. No vertical dividers. Header text in `label-xs` with `#A1A1A1` color.
- **Progress Bars:** Thin 4px height. Track is `#1A1A1A`, fill is Electric Blue.