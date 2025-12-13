# Public Assets

This directory contains static assets that are served directly by the application.

## Logo Files

To replace the text-based logo with actual logo images, place the following files in this directory:

- **open-mandi-logo-with-name.png** - Full logo with company name (used on desktop)
- **open-mandi-logo-without-name.png** - Icon-only logo (used on mobile)

### Recommended Specifications:

- **open-mandi-logo-with-name.png**:

  - Height: ~32px (or higher for retina displays)
  - Format: PNG with transparent background
  - Contains both icon and "Open Mandi" text

- **open-mandi-logo-without-name.png**:
  - Size: ~32x32px (square, or higher for retina displays)
  - Format: PNG with transparent background
  - Icon/symbol only

Once these files are added, update the Header component to use:

```tsx
<img
  src="/open-mandi-logo-with-name.png"
  alt="Open Mandi"
  className="hidden md:block h-8"
/>
<img
  src="/open-mandi-logo-without-name.png"
  alt="Open Mandi"
  className="block md:hidden h-8 w-8"
/>
```

## Other Assets

Place any other static assets (images, fonts, etc.) that need to be publicly accessible in this directory.
