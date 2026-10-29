// Present one academic year at a time; consume the existing scoped statistics unchanged.
const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
export function renderYearBreakdown({ years, ranks, onYearChange }) {
  const head = document.getElementById('reportYearSemesterMatrixThead');
  const body = document.getElementById('reportYearSemesterMatrixBody');
  const foot = document.getElementById('reportYearSemesterMatrixFooter');
  const table = body?.closest('table');
  if (!table || !head || !years.length) return;
  table.id = 'yearBreakdownTable'; table.classList.add('year-breakdown-table');
  const scroll = table.parentElement;
  scroll.classList.add('year-breakdown-scroll');
  const card = scroll.parentElement;
  card.classList.add('year-breakdown-card');
  const requested = Number(table.dataset.year);
  const current = years.find(item => item.year === requested)
    || [...years].reverse().find(item => item.fullYear.totalGradedCourseInstances > 0) || years[0];
  if (requested || years.some(item => item.fullYear.totalGradedCourseInstances > 0)) table.dataset.year = current.year;
  let controls = card.querySelector('.year-breakdown-controls');
  if (!controls) {
    controls = make('div','year-breakdown-controls');
    const picker = make('div','year-breakdown-picker');
    picker.setAttribute('role','group'); picker.setAttribute('aria-label','Năm học của điểm quá trình');
    for (const year of years) {
      const button = make('button','',`Năm ${year.year}`);
      button.type = 'button'; button.dataset.year = year.year;
      button.setAttribute('aria-controls',table.id);
      button.addEventListener('click', () => {
        table.dataset.year = String(year.year);
        onYearChange();
        button.focus({preventScroll:true});
      });
      button.addEventListener('keydown', event => {
        const buttons = [...picker.children]; let next;
        const index = buttons.indexOf(button);
        if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
        else if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
        event.preventDefault();buttons[next].click();
      });
      picker.append(button);
    }
    controls.append(picker,make('span','year-breakdown-scope'));
    scroll.before(controls);
    const status = make('p','year-breakdown-status');status.setAttribute('role','status');controls.after(status);
    const summary = make('div','year-breakdown-summary');scroll.after(summary);
    const details = make('details','year-breakdown-debts');
    details.append(make('summary','','Chi tiết rớt môn theo xếp loại'));
    const detailsScroll = make('div','year-breakdown-detail-scroll');
    const detailsTable = make('table');const detailsHead=make('thead'),labels=make('tr');
    for (const text of ['Xếp loại','Học viên rớt môn','Lượt rớt']) {const th=make('th','',text);th.scope='col';labels.append(th);}
    detailsHead.append(labels);detailsTable.append(detailsHead,make('tbody'));detailsScroll.append(detailsTable);details.append(detailsScroll);summary.after(details);
  }
  for (const button of controls.querySelectorAll('button')) {
    const selected = Number(button.dataset.year) === current.year;
    button.setAttribute('aria-pressed',String(selected));button.tabIndex=selected?0:-1;
  }
  controls.querySelector('.year-breakdown-scope').textContent = `${current.fullYear.totalCadets} học viên`;
  const hasData = current.fullYear.totalGradedCourseInstances > 0;
  const status = card.querySelector('.year-breakdown-status');
  status.textContent = hasData ? '' : `Năm ${current.year} chưa có điểm`; status.hidden = hasData;
  const columns = [{text:'HK1',hint:`Kỳ ${current.sem1Num}`,stats:current.hk1},{text:'HK2',hint:`Kỳ ${current.sem2Num}`,stats:current.hk2},{text:'Cả năm',hint:`Năm ${current.year}`,stats:current.fullYear}];
  const headers = make('tr');
  const rankHeader = make('th','','Xếp loại');rankHeader.scope='col';headers.append(rankHeader);
  for (const column of columns) {
    const th=make('th',column===columns[2]?'year-total':'');th.scope='col';
    th.append(make('span','',column.text),make('small','',column.hint));headers.append(th);
  }
  head.replaceChildren(headers);body.replaceChildren();
  for (const rank of ranks) {
    const row=make('tr');
    const label=make('th','year-rank');label.scope='row';label.append(make('strong','',rank.name),make('small','year-standard-full',rank.standard),make('small','year-standard-short',rank.standard.replace(/(\d+)\.00/g,'$1').replace(/(\d+\.\d)0\b/g,'$1').replace(/\s+/g,'')));row.append(label);
    for (const column of columns) {
      const cell=make('td',column===columns[2]?'year-total':'');
      const available=column.stats.totalGradedCourseInstances>0;
      cell.append(make('strong','year-count',available?column.stats.rankCounts[rank.name]||0:'—'));
      if (available) cell.append(make('small','year-rate',`${column.stats.rankRates[rank.name]||'0.0'}%`));
      row.append(cell);
    }
    body.append(row);
  }
  if (foot) {
    const row=make('tr');const label=make('th','','Điểm trung bình');label.scope='row';row.append(label);
    for (const column of columns) row.append(make('td',column===columns[2]?'year-total':'',column.stats.totalGradedCourseInstances>0?column.stats.avgGpa:'—'));
    foot.replaceChildren(row);
  }
  const summary=card.querySelector('.year-breakdown-summary');summary.replaceChildren();
  for (const [index,[label,value]] of [['Học viên rớt môn',current.fullYear.debtStudentCount],['Tổng lượt rớt',current.fullYear.totalDebtFailsCount]].entries()) {
    const metric=make('div',hasData&&value>0?'has-debt':'');
    const amount=make('div','year-metric-value');amount.append(make('strong','',hasData?value:'—'));
    if(index===0&&hasData)amount.append(make('small','',`${current.fullYear.debtStudentRate}%`));
    metric.append(make('span','',label),amount);summary.append(metric);
  }
  const debts=card.querySelector('.year-breakdown-debts tbody');debts.replaceChildren();
  for (const rank of ranks) {
    const row=make('tr');const label=make('th','',rank.name);label.scope='row';row.append(label);
    row.append(make('td','',hasData?current.fullYear.rankDebtStudents[rank.name]||0:'—'),make('td','',hasData?current.fullYear.rankFailInstances[rank.name]||0:'—'));debts.append(row);
  }
}
