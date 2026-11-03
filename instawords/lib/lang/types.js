/** Split a digit string into 3-digit groups, least significant first. */
export function splitGroups(digits) {
    const groups = [];
    for (let end = digits.length; end > 0; end -= 3) {
        groups.push(parseInt(digits.slice(Math.max(0, end - 3), end), 10));
    }
    return groups;
}
