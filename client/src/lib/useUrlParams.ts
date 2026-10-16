import { useSearchParams } from 'react-router-dom';

export function useUrlParams<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultValues: Record<string, string> = defaults;

  const values = {} as Record<keyof T & string, string>;
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    values[key] = searchParams.get(key) ?? defaultValues[key];
  }

  function update(changes: Partial<Record<keyof T & string, string>>, options: { replace?: boolean } = {}) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes) as [string, string][]) {
          if (value === '' || value === defaultValues[key]) next.delete(key);
          else next.set(key, value);
        }
        // أي تغيير بالفلتر أو البحث بيرجعنا للصفحة الأولى
        if (!('page' in changes)) next.delete('page');
        return next;
      },
      { replace: options.replace ?? false },
    );
  }

  return { values, update };
}