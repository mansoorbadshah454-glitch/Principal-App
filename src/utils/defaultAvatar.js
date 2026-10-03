// Clean Facebook / Modern neutral silhouette SVG data URI
export const DEFAULT_STUDENT_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="64" fill="%23E2E8F0"/><circle cx="64" cy="46" r="22" fill="%2394A3B8"/><path d="M64 74c-22 0-38 12.5-44 32 11 14 28 22 44 22s33-8 44-22c-6-19.5-22-32-44-32z" fill="%2394A3B8"/></svg>`;

/**
 * Resolves a student's avatar image URL.
 * If the student does not have a real uploaded photo (or has an old dicebear cartoon url),
 * returns the clean Facebook-style neutral silhouette.
 */
export const getStudentAvatar = (studentOrUrl) => {
    if (!studentOrUrl) return DEFAULT_STUDENT_AVATAR;
    
    const url = typeof studentOrUrl === 'string' ? studentOrUrl : (
        studentOrUrl.profileImageUrl || 
        studentOrUrl.profilePic || 
        studentOrUrl.avatar || 
        studentOrUrl.photoUrl || 
        studentOrUrl.image || 
        ''
    );
    
    if (typeof url === 'string') {
        const clean = url.trim();
        // If it's a real custom photo (and NOT an old cartoon dicebear url)
        if (clean && !clean.includes('dicebear.com')) {
            return clean;
        }
    }
    
    return DEFAULT_STUDENT_AVATAR;
};
