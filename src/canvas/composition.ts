import { createElement, type CanvasElement } from './model';
/** Keep constrained composite children in sync with the parent Figma variant. */
export function syncComposition(element: CanvasElement): CanvasElement {
 const key=element.component==='tag-group'?'tags':element.component==='items-list'?'items':undefined;
 if(!key || !element.slots?.[key]) return element;
 const count=Number(String(element.variantProps.amount).replace('x',''));
 const children=Array.from({length:count},(_,i)=>{
 const child=element.slots![key]![i] ?? createElement(key==='tags'?'tag-item':'dropdown-item');
 if(key==='tags')return {...child,variantProps:{...child.variantProps,size:element.variantProps.size,variant:'primary',state:element.variantProps.disabled?'disabled':'default'},editorProps:{...child.editorProps,closable:element.variantProps.closable}};
 return {...child,variantProps:{...child.variantProps,size:element.variantProps.size}};
 });
 return {...element,slots:{...element.slots,[key]:children}};
}
