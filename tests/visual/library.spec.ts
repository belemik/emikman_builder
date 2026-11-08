import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../../design-system/examples/library-${name}.v3.json`,import.meta.url),'utf8'));
async function open(page:Page,name:string){await page.goto('./?view=laboratory');await page.getByRole('button',{name:'Открыть демоверсию'}).click();await page.locator('input[type=file]').setInputFiles({name:'library.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(read(name)))});await page.getByRole('button',{name:'Строгий DS Renderer',exact:true}).click();await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.wdeaf-renderer')).toBeVisible();}
for(const name of ['tags','chips','menu'])test(`${name}: reviewed states and original asset geometry`,async({page})=>{
 await open(page,name);const renderer=page.locator('.wdeaf-renderer');
 await expect.poll(()=>renderer.locator('img').evaluateAll(imgs=>imgs.every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0))).toBe(true);
 expect(await renderer.locator('img').evaluateAll(imgs=>imgs.every(img=>img.getBoundingClientRect().width===(img as HTMLImageElement).naturalWidth&&img.getBoundingClientRect().height===(img as HTMLImageElement).naturalHeight))).toBe(true);
 await expect(renderer).toHaveScreenshot(`${name}.png`);
 if(name==='chips'){const chip=renderer.locator('[data-ds-component=chip]:not(:disabled)').first();const prior=await chip.getAttribute('aria-pressed');await chip.click();await expect(chip).toHaveAttribute('aria-pressed',prior==='true'?'false':'true');}
});
test('compositions, Select mouse and keyboard interaction, reload and lossless JSON export',async({page})=>{
 await open(page,'composition');const renderer=page.locator('.wdeaf-renderer');await expect(renderer).toHaveScreenshot('composition.png');
 const select=renderer.getByRole('combobox');await select.click();await expect(renderer.getByRole('listbox')).toBeVisible();await expect(page.locator('.canvas-paper')).toHaveScreenshot('select-open.png');
 await renderer.getByRole('option',{name:'Beta',exact:true}).click();await expect(select).toContainText('Beta');await expect(select).toHaveAttribute('aria-expanded','false');
 await select.press('ArrowDown');await select.press('End');await select.press('Enter');await expect(select).toContainText('Gamma');
 await select.click();await select.press('Escape');await expect(select).toHaveAttribute('aria-expanded','false');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт JSON',exact:true}).click();const file=await download;const stream=await file.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(chunk);const expected=read('composition');expected.elements[1].interactionState={selectedValue:'Gamma'};expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(expected);
 await page.reload();await page.getByRole('button',{name:'Открыть демоверсию'}).click();await page.getByRole('button',{name:'Строгий DS Renderer',exact:true}).click();await expect(page.locator('[data-ds-component=hint]')).toContainText('10/25');await expect(page.locator('.wdeaf-renderer').getByRole('combobox')).toContainText('Gamma');
 await page.getByRole('button',{name:'Редакторский preview',exact:true}).click();const editorSelect=page.locator('.canvas-paper').getByRole('combobox');await expect(editorSelect).toContainText('Gamma');await editorSelect.click();await page.getByRole('option',{name:'Alpha',exact:true}).click();await page.getByRole('button',{name:'Строгий DS Renderer',exact:true}).click();await expect(page.locator('.wdeaf-renderer').getByRole('combobox')).toContainText('Alpha');
});
test('Select reviewed error, disabled and both popup directions',async({page})=>{
 const variants=JSON.parse(readFileSync(new URL('../../design-system/library-matrix.json',import.meta.url),'utf8')).select;
 await open(page,'composition');page.on('dialog',dialog=>dialog.accept());
 for(const row of variants){
 const fixture=read('composition');fixture.elements=[{...fixture.elements[1],variantProps:row.props}];
 await page.locator('input[type=file]').setInputFiles({name:'select.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 const control=page.locator('.wdeaf-renderer').getByRole('combobox');
 await expect(control).toHaveAttribute('aria-invalid',String(row.props.state==='error'));
 if(row.props.state.startsWith('disabled'))await expect(control).toBeDisabled();
 if(row.props.state==='pressed'){const menu=page.locator('[data-ds-component=dropdown-menu]');await expect(menu).toBeVisible();const a=await control.boundingBox(),b=await menu.boundingBox();expect(row.props.foldDirection==='up'?b!.y+b!.height<a!.y:b!.y>a!.y+a!.height).toBe(true);}
 else await expect(control).toHaveScreenshot(`select-${row.nodeId.replace(':','-')}.png`);
 }
});

test('TagGroup changes only between verified one/two-tag variants and persists children',async({page})=>{
 await open(page,'composition');const group=page.locator('.wdeaf-renderer [data-ds-component=tag-group]');
 await expect(group.locator('[data-ds-component=tag-item]')).toHaveCount(2);
 await group.getByRole('button',{name:/Удалить/}).first().click();await expect(group.locator('[data-ds-component=tag-item]')).toHaveCount(1);
 await expect(group.getByRole('button',{name:/Удалить/})).toHaveCount(0);
 await group.getByRole('button',{name:'Add Tag',exact:true}).click();await expect(group.locator('[data-ds-component=tag-item]')).toHaveCount(2);
 await expect(group.getByRole('button',{name:'Add Tag',exact:true})).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Открыть демоверсию'}).click();await page.getByRole('button',{name:'Строгий DS Renderer',exact:true}).click();await expect(group.locator('[data-ds-component=tag-item]')).toHaveCount(2);
});
test('forbidden roots are hidden; rejected saves can be recovered without overwrite',async({page})=>{
 await page.goto('./?view=laboratory');const bad=read('tags');bad.elements=[{id:'old-tag-input',component:'tag-input',variantProps:{size:'m',variant:'primary'},editorProps:{}}];const raw=JSON.stringify(bad);
 await page.evaluate(raw=>localStorage.setItem('wdeaf.demo.emikman_builder.canvas.v2',raw),raw);await page.getByRole('button',{name:'Открыть демоверсию'}).click();
 await expect(page.getByRole('status')).toContainText('INTERNAL_COMPONENT');await expect(page.locator('.catalog-card').filter({hasText:'TagInput'})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('wdeaf.demo.emikman_builder.canvas.v2'))).toBe(raw);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать исходный JSON'}).click();const stream=await(await download).createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(chunk);expect(Buffer.concat(chunks).toString()).toBe(raw);
 await page.getByRole('button',{name:'Продолжить с текущим холстом'}).click();
 const backupValues=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('wdeaf.demo.emikman_builder.canvas.v2.rejected-backup.')).map(k=>localStorage.getItem(k)));
 expect(await backupValues()).toEqual([raw]);
 const raw2=raw.replace('old-tag-input','second-tag-input');
 await page.evaluate(raw=>localStorage.setItem('wdeaf.demo.emikman_builder.canvas.v2',raw),raw2);
 await page.reload();await page.getByRole('button',{name:'Открыть демоверсию'}).click();
 await page.getByRole('button',{name:'Закрыть сообщение',exact:true}).click();
 await expect(page.getByRole('button',{name:'Скачать исходный JSON'})).toBeVisible();
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
 await page.getByRole('button',{name:'Продолжить с текущим холстом'}).click();
 await expect(page.getByRole('status')).toContainText('Не удалось сохранить резервную копию');
 expect(await page.evaluate(()=>localStorage.getItem('wdeaf.demo.emikman_builder.canvas.v2'))).toBe(raw2);
 expect(await backupValues()).toEqual([raw]);
 await page.reload();await page.getByRole('button',{name:'Открыть демоверсию'}).click();
 await page.getByRole('button',{name:'Продолжить с текущим холстом'}).click();
 expect((await backupValues()).sort()).toEqual([raw,raw2].sort());
 await page.reload();await page.getByRole('button',{name:'Открыть демоверсию'}).click();
 await page.getByText('Резервные копии JSON',{exact:true}).click();
 await expect(page.getByRole('button',{name:/Скачать копию/})).toHaveCount(2);
 const copies:string[]=[];
 for(const button of await page.getByRole('button',{name:/Скачать копию/}).all()){
 const event=page.waitForEvent('download');await button.click();const stream=await(await event).createReadStream();const parts:Buffer[]=[];for await(const chunk of stream!)parts.push(chunk);copies.push(Buffer.concat(parts).toString());
 }
 expect(copies.sort()).toEqual([raw,raw2].sort());
});
test('Tag close removes only enabled closable roots and persists the remaining document',async({page})=>{
 await open(page,'composition');page.on('dialog',dialog=>dialog.accept());
 const fixture=read('composition'),tag=structuredClone(fixture.elements[2].slots.tags[0]);
 tag.id='closable-root';tag.variantProps.state='default';tag.editorProps.closable=true;
 const disabled=structuredClone(tag);disabled.id='disabled-root';disabled.variantProps.state='disabled';
 fixture.elements=[tag,disabled];await page.locator('input[type=file]').setInputFiles({name:'tags.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 const renderer=page.locator('.wdeaf-renderer');await expect(renderer.getByRole('button',{name:/Удалить/})).toHaveCount(1);await renderer.getByRole('button',{name:/Удалить/}).click();await expect(renderer.locator('[data-ds-component=tag-item]')).toHaveCount(1);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wdeaf.demo.emikman_builder.canvas.v2')!));expect(saved.elements.map((e:{id:string})=>e.id)).toEqual(['disabled-root']);expect(saved.tokenReferences).toEqual(fixture.tokenReferences);
});
