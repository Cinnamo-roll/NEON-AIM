export const CAREER_OVERVIEW_PAGE_SIZE = 10;

export type CareerOverviewPaginationItem = number | "start-ellipsis" | "end-ellipsis";

export function getCareerOverviewPaginationItems(currentPage: number, totalPages: number): CareerOverviewPaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index);

  const visiblePages = [...new Set([0, totalPages - 1, currentPage - 1, currentPage, currentPage + 1])]
    .filter((pageIndex) => pageIndex >= 0 && pageIndex < totalPages)
    .sort((left, right) => left - right);
  const items: CareerOverviewPaginationItem[] = [];

  visiblePages.forEach((pageIndex, index) => {
    const previousPage = visiblePages[index - 1];
    if (index > 0 && pageIndex - previousPage > 1) {
      items.push(previousPage === 0 ? "start-ellipsis" : "end-ellipsis");
    }
    items.push(pageIndex);
  });

  return items;
}
