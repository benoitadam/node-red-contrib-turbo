/**
 * Splits object path into array of property names
 * @param path - Object path string (e.g., "msg.a[5].d['prop.a']")
 * @returns Array of property names with quotes removed, 'msg' prefix excluded
 * @example
 * pathParts("msg.a[5].d['prop.a']") // ["a", "5", "d", "prop.a"]
 * pathParts("user.name") // ["user", "name"]
 */
const pathParts = (path: string): string[] => {
    if (!path) return [];
    const parts = path.match(/[^.\[\]'"]+|'[^']*'|"[^"]*"/g);
    if (!parts) return [];
    if (parts[0] === "msg") parts.shift();

    for (let i = 0, l = parts.length; i < l; i++) {
        const prop = parts[i];
        const first = prop[0];
        const last = prop[prop.length - 1];

        if (
            (first === '"' && last === '"') || (first === "'" && last === "'")
        ) {
            parts[i] = prop.slice(1, -1);
        }
    }

    return parts;
};

/**
 * Safely gets nested property value from object using dot notation path
 * @param obj - Source object to traverse
 * @param path - Property path string (e.g., "user.profile.name" or "items[0].title")
 * @returns Property value if found, undefined otherwise
 * @example
 * getPath({user: {name: "John"}}, "user.name") // "John"
 * getPath({items: [{id: 1}]}, "items[0].id") // 1
 * getPath({}, "missing.prop") // undefined
 */
export const getPath = (obj: any, path: string): any => {
    if (obj == null || !path) return undefined;

    let current = obj;
    const parts = pathParts(path);

    for (let i = 0, l = parts.length; i < l; i++) {
        if (current == null || typeof current !== "object") return undefined;

        const prop = parts[i];

        if (Array.isArray(current)) {
            const index = parseInt(prop, 10);
            if (Number.isNaN(index)) return undefined;
            current = index < 0
                ? current[current.length + index]
                : current[index];
        } else {
            current = current[prop];
        }
    }

    return current;
};

/**
* Sets nested property value in object using dot notation path
* @param obj - Target object to modify
* @param path - Property path string (e.g., "user.profile.name" or "items[0].title")
* @param value - Value to set at the specified path
* @returns The modified object (mutates original)
* @example
* setPath({}, "user.name", "John") // {user: {name: "John"}}
* setPath({items: []}, "items[0].id", 1) // {items: [{id: 1}]}
* setPath({user: {}}, "user.settings.theme", "dark") // {user: {settings: {theme: "dark"}}}
*/
export const setPath = (obj: any, path: string, value: any): any => {
 if (obj == null || !path) return obj;
 
 let current = obj;
 const parts = pathParts(path);
 const lastIndex = parts.length - 1;
 
 for (let i = 0; i < lastIndex; i++) {
   const prop = parts[i];
   const nextProp = parts[i + 1];
   const isNextArray = /^\d+$/.test(nextProp);
   
   if (current[prop] == null) {
     current[prop] = isNextArray ? [] : {};
   } else if (typeof current[prop] !== 'object') {
     current[prop] = isNextArray ? [] : {};
   }
   
   current = current[prop];
 }
 
 const finalProp = parts[lastIndex];
 
 if (Array.isArray(current)) {
   const index = parseInt(finalProp, 10);
   if (!Number.isNaN(index)) {
     if (index < 0) {
       current[current.length + index] = value;
     } else {
       // Extend array if needed
       while (current.length <= index) {
         current.push(undefined);
       }
       current[index] = value;
     }
   }
 } else {
   current[finalProp] = value;
 }
 
 return obj;
};

export const setTemplate = (template: string, obj: any): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, path) => {
    const value = getPath(obj, path);
    if (typeof value === 'string' || typeof value === 'number') return value;
    return value;
  });
}