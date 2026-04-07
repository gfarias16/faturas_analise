export function toCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function toMonthLabel(monthKey: string): string {
  if (!monthKey) {
    return "Sem mês";
  }

  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function toInputDate(value: string): string {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [day, month, year] = value.split("/");
  if (!day || !month || !year) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

export function fromInputDate(value: string): string {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-");
  if (!day || !month || !year) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

export function formatEntryDateMeta(dateValue: string, purchaseTime = ""): string {
  if (!dateValue) {
    return "";
  }

  const [day, month, year] = dateValue.split("/");
  if (!day || !month || !year) {
    return purchaseTime ? `${dateValue} - ${purchaseTime}` : dateValue;
  }

  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
  const weekdayMap = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const weekday = weekdayMap[parsedDate.getDay()] ?? "";

  return [weekday, purchaseTime].filter(Boolean).join(" - ");
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
