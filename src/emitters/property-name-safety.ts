const OBJECT_PROTOTYPE_PROPERTY_NAMES = new Set(Object.getOwnPropertyNames(Object.prototype));

const EXTRA_UNSAFE_PROPERTY_NAMES = new Set(["__proto__", "prototype"]);

export function isPrototypeUnsafePropertyName(propertyName: string): boolean {
  return (
    OBJECT_PROTOTYPE_PROPERTY_NAMES.has(propertyName) ||
    EXTRA_UNSAFE_PROPERTY_NAMES.has(propertyName)
  );
}
