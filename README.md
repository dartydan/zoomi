# ZOOMI Marketing Website

A modern, responsive marketing website built with Tailwind CSS v4 and a sophisticated design system featuring CSS custom properties.

## Features

- 🎨 **Tailwind CSS v4** - Utility-first CSS framework for rapid UI development
- 🎭 **Custom Design System** - Sophisticated color palette with CSS custom properties
- 📱 **Fully Responsive** - Mobile-first design that works on all devices
- 🚀 **Modern Design** - Clean, professional design with warm, earthy aesthetics
- 📊 **Audit Demo Form** - Integrated webhook for collecting audit requests
- 🔍 **SEO Optimized** - Semantic HTML and performance optimizations
- 🎭 **Smooth Animations** - Intersection Observer animations and hover effects
- 🌙 **Dark Mode Ready** - CSS custom properties support for theme switching

## Tech Stack

- **HTML5** - Semantic markup
- **Tailwind CSS v4** - Utility-first CSS framework with custom design tokens
- **CSS Custom Properties** - Sophisticated design system with CSS variables
- **JavaScript (ES6+)** - Modern JavaScript with async/await
- **Font Awesome** - Icon library
- **Google Fonts** - Libre Baskerville, Lora, and IBM Plex Mono typography

## Design System

### Color Palette

The website uses a sophisticated, modern pink/teal color scheme:

- **Primary**: Vibrant pink (#d04f99) - Main brand color
- **Secondary**: Soft teal (#8acfd1) - Supporting elements
- **Accent**: Warm gold (#fbe2a7) - Highlighting and CTAs
- **Background**: Soft pink (#f6e6ee) - Main background
- **Foreground**: Medium gray (#5b5b5b) - Text and content
- **Chart Colors**: Range of pinks, teals, and golds for data visualization

### Typography

- **Sans**: Poppins - Primary font for headings and display text
- **Serif**: Lora - Secondary font for body text and emphasis
- **Mono**: Fira Code - Monospace font for code and technical content

### Shadows & Borders

Custom shadow system with vibrant undertones:
- Subtle shadows with pink/teal color values
- Consistent border radius system (0.4rem base)
- Layered shadow effects for depth

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd zoomi
```

2. Install dependencies:
```bash
npm install
```

3. Build the CSS:
```bash
npm run build
```

4. For development with auto-rebuild:
```bash
npm run build:watch
```

### Project Structure

```
zoomi/
├── dist/
│   └── output.css          # Compiled Tailwind CSS
├── input.css               # Tailwind CSS source with design system
├── marketing.html          # Main marketing page
├── marketing.js            # JavaScript functionality
├── tailwind.config.js      # Tailwind configuration
├── postcss.config.js       # PostCSS configuration
└── package.json            # Dependencies and scripts
```

## Customization

### Design System Variables

The website uses CSS custom properties for easy theming:

```css
:root {
  --primary: #d04f99;
  --secondary: #8acfd1;
  --accent: #fbe2a7;
  --background: #f6e6ee;
  --foreground: #5b5b5b;
  /* ... more variables */
}
```

### Component Classes

Custom component classes using the design system:

- `.btn-primary` - Primary button with vibrant pink styling
- `.btn-secondary` - Secondary button with teal styling
- `.card` - Card component with subtle shadows and borders
- `.form-input` - Form input with consistent styling
- `.section-title` - Section headings with serif typography
- `.gradient-text` - Gradient text effect using primary colors

### Basecoat UI Integration

The website integrates Basecoat UI components for enhanced functionality:

- **Button Components**: `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-ghost`
- **Card Components**: `.card`, `.card-elevated`, `.card-interactive`
- **Form Components**: `.form-input`, `.form-textarea`, `.form-select`, `.form-checkbox`, `.form-radio`
- **Typography Components**: `.heading-1`, `.heading-2`, `.heading-3`, `.body-large`, `.body-medium`, `.body-small`
- **Layout Components**: `.container`, `.section`, `.section-sm`, `.section-lg`, `.grid-responsive`
- **Interactive Components**: `.nav-link`, `.nav-link-active`, `.nav-dropdown`
- **Utility Components**: `.glass-effect`, `.gradient-border`, `.text-shadow`

### Adding New Colors

1. Add new CSS custom properties to `:root` in `input.css`
2. Update the `@theme inline` section
3. Add corresponding colors to `tailwind.config.js`
4. Rebuild CSS with `npm run build`

### Basecoat UI Benefits

- **Consistent Design**: Standardized component library for uniform appearance
- **Accessibility**: Built-in accessibility features and focus management
- **Responsive**: Mobile-first responsive design patterns
- **Performance**: Optimized CSS with minimal bundle size
- **Maintainability**: Clear component structure and naming conventions
- **Extensibility**: Easy to customize and extend with custom components

## Form Integration

The audit demo form sends data to a webhook using GET requests with query parameters:

```
https://danzoomi.app.n8n.cloud/webhook/ba96e36a-328b-4be6-80ee-ce990120742a?email=user@example.com&url=https://example.com
```

## Development

### Building CSS

- **Build once**: `npm run build`
- **Watch mode**: `npm run build:watch`

### Adding New Styles

1. Edit `input.css` to add custom component classes
2. Use `@apply` directive with design system variables
3. Rebuild CSS with `npm run build`

### Responsive Design

The website uses Tailwind's responsive prefixes:
- `sm:` - Small devices (640px+)
- `md:` - Medium devices (768px+)
- `lg:` - Large devices (1024px+)
- `xl:` - Extra large devices (1280px+)

## Accessibility

The website meets WCAG AA standards for contrast ratios and includes comprehensive accessibility features:

### **Contrast Ratios**
- **Light Mode**: All text meets 4.5:1 contrast ratio (WCAG AA)
- **Dark Mode**: All text meets 4.5:1 contrast ratio (WCAG AA)
- **Large Text**: Meets 3:1 contrast ratio requirements
- **Interactive Elements**: High contrast focus indicators

### **Focus Management**
- **Visible Focus**: Clear focus rings on all interactive elements
- **Keyboard Navigation**: Full keyboard accessibility
- **Focus Indicators**: High contrast rings with proper offset
- **Skip Links**: Logical tab order and focus management

### **Color Accessibility**
- **Color Independence**: Information not conveyed by color alone
- **High Contrast**: Sufficient contrast for all text and backgrounds
- **Focus States**: Clear visual indicators for focus and hover
- **Form Elements**: Accessible form inputs with proper contrast

### **Semantic HTML**
- **Proper Headings**: Logical heading hierarchy
- **Alt Text**: Descriptive text for images and icons
- **Landmarks**: Proper use of semantic HTML elements
- **ARIA Labels**: Accessible labels for interactive elements

## Performance

- **CSS Purge**: Only used Tailwind classes are included in the final CSS
- **Font Loading**: Google Fonts loaded with preload for performance
- **Image Optimization**: SVG icons and optimized graphics
- **Lazy Loading**: Intersection Observer for scroll-based animations
- **CSS Variables**: Efficient theming without duplication

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Dark Mode

The website includes a fully functional dark mode toggle with the following features:

### **Toggle Button**
- Located in the navigation bar (desktop) and mobile menu
- Smooth icon transitions between moon (light) and sun (dark)
- Hover effects and focus states for accessibility

### **Automatic Detection**
- **System Preference**: Automatically detects user's OS dark mode preference
- **User Preference**: Remembers user's choice using localStorage
- **Smart Switching**: Only auto-switches if user hasn't set an explicit preference

### **Smooth Transitions**
- 300ms smooth transitions between light and dark themes
- All colors, backgrounds, and borders animate smoothly
- No jarring visual changes

### **Theme Persistence**
- User's dark mode preference is saved and restored on page reload
- Works across browser sessions

### **Implementation**
The design system includes dark mode support through CSS custom properties:

```css
:root {
  --background: #f6e6ee;  /* Soft pink */
  --foreground: #5b5b5b;  /* Medium gray */
  /* ... light theme variables */
}

.dark {
  --background: #12242e;  /* Deep blue */
  --foreground: #f3e3ea;  /* Light pink */
  /* ... dark theme variables */
}
```

### **Usage**
- Click the moon/sun icon in the navigation to toggle themes
- Dark mode automatically activates based on system preference
- Smooth notifications confirm theme changes

## License

ISC License - see LICENSE file for details.

## Support

For questions or support, contact hello@zoomi.com
