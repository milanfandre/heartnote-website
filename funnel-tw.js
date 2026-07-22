// Tailwind theme for the ad funnel pages. Must load AFTER the Tailwind CDN
// script and BEFORE the page renders. Mirrors the tokens used on the main site.
tailwind.config = {
  theme: {
    extend: {
      colors: {
        claret: { DEFAULT: '#6E1423', deep: '#4E0E1A', dark: '#360911' },
        gold: { DEFAULT: '#C6973F', soft: '#E4C67F', pale: '#EFDCA9' },
        ivory: { DEFAULT: '#F7F1E6', deep: '#EFE6D4' },
        blush: '#E9CBC0',
        ink: { DEFAULT: '#2B2019', soft: '#6B5D50' },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Nunito Sans"', 'system-ui', 'sans-serif'],
        script: ['"Pinyon Script"', 'cursive'],
      },
      boxShadow: {
        keepsake: '0 1px 2px rgba(54,9,17,.06), 0 12px 28px -12px rgba(110,20,35,.28), 0 40px 64px -32px rgba(110,20,35,.22)',
        lift: '0 2px 4px rgba(54,9,17,.05), 0 18px 40px -16px rgba(110,20,35,.30)',
        gold: '0 8px 24px -8px rgba(198,151,63,.45)',
      },
    },
  },
};
