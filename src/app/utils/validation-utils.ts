// src/app/utils/validation-utils.ts

export interface ValidationResult {
    isValid: boolean;
    message?: string;
}

// Email validation
export function validateEmail(email: string): ValidationResult {
    if (!email || email.trim() === '') {
        return { isValid: false, message: 'Email is required' };
    }

    if (email.length > 254) {
        return { isValid: false, message: 'Email is too long (max 254 characters)' };
    }

    // More comprehensive email regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(email)) {
        return { isValid: false, message: 'Please enter a valid email address' };
    }

    return { isValid: true };
}

// Password strength validation
export function validatePasswordStrength(password: string): ValidationResult {
    if (!password || password.trim() === '') {
        return { isValid: false, message: 'Password is required' };
    }

    if (password.length < 8) {
        return { isValid: false, message: 'Password must be at least 8 characters long' };
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
        return { isValid: false, message: 'Password must contain at least one uppercase letter' };
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
        return { isValid: false, message: 'Password must contain at least one lowercase letter' };
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
        return { isValid: false, message: 'Password must contain at least one number' };
    }

    // Check for at least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return { isValid: false, message: 'Password must contain at least one special character' };
    }

    return { isValid: true };
}

// Name validation
export function validateName(name: string): ValidationResult {
    if (!name || name.trim() === '') {
        return { isValid: false, message: 'Name is required' };
    }

    const trimmedName = name.trim();
    
    if (trimmedName.length < 2) {
        return { isValid: false, message: 'Name must be at least 2 characters long' };
    }

    if (trimmedName.length > 100) {
        return { isValid: false, message: 'Name is too long (max 100 characters)' };
    }

    // Check for valid name characters (letters, spaces, hyphens, apostrophes, and some unicode)
    const nameRegex = /^[a-zA-Z\u00C0-\u017F\u0400-\u04FF\u4e00-\u9fff\s'-]+$/;
    
    if (!nameRegex.test(trimmedName)) {
        return { isValid: false, message: 'Name contains invalid characters' };
    }

    return { isValid: true };
}

// Simple email validation (for cases where we just need boolean)
export function isValidEmail(email: string): boolean {
    return validateEmail(email).isValid;
}

// Simple password validation (for cases where we just need boolean)
export function isStrongPassword(password: string): boolean {
    return validatePasswordStrength(password).isValid;
}

// Simple name validation (for cases where we just need boolean)
export function isValidName(name: string): boolean {
    return validateName(name).isValid;
}
