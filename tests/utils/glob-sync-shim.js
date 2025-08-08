const fg = require('fast-glob');

module.exports = {
	default: {
		sync: (pattern, options = {}) =>
			fg.sync(pattern, { dot: true, onlyFiles: false, unique: true, ...options })
	}
};
