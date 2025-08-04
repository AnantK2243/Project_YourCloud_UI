/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/**/*.{html,ts}'],
	theme: {
		extend: {
			colors: {
				'deep-blue': '#0000ff',
				'bright-teal': '#00ffff'
			},
			backdropBlur: {
				xl: '20px',
				'2xl': '40px'
			}
		}
	},
	plugins: []
};
