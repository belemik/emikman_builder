export function CatalogSample({ component }: { component: string }) {
  if (component === 'button') return <span className="sample-button">Продолжить</span>;
  if (component === 'input') return <span className="sample-input">Введите email</span>;
  if (component === 'select') return <span className="sample-input sample-select">Выберите страну<img src="/ds/select-chevron.svg" width="16" height="16" alt="" /></span>;
  if (component === 'checkbox') return <span className="sample-checkbox"><img src="/ds/checkbox-0.svg" width="20" height="20" alt="" />Согласен</span>;
  return <span className="sample-table"><span>Код</span><span>Наименование</span><span>PETROL</span><span>Бензин</span><span>DIESEL</span><span>Дизель</span></span>;
}
