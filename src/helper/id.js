
export const nextGlobalId = (function() {
  let globalId = 0;
  return (prefix = '?') => {
    prefix = prefix.toUpperCase();

    ++globalId;
    return `${prefix}${globalId.toString(36)}`;
  };
}());