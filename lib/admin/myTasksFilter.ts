/** Показывать ли элемент при включённом фильтре «только мои задачи». */
export function matchesMyTasksFilter(
  assigneeAdminId: number | null | undefined,
  myAdminId: number,
  myTasksOnly: boolean,
): boolean {
  if (!myTasksOnly) return true;
  return assigneeAdminId === myAdminId;
}

export const MY_TASKS_STORAGE_KEY = 'admin_my_tasks_only';

export function readMyTasksOnlyFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(MY_TASKS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMyTasksOnlyToStorage(value: boolean): void {
  try {
    sessionStorage.setItem(MY_TASKS_STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* sessionStorage недоступен */
  }
}
