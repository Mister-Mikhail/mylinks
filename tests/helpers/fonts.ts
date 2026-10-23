import type { Page, Locator } from '@playwright/test'
export async function chooseFont(scope:Page|Locator,label:string,value:string){
 const control=scope.getByLabel(`Шрифт: ${label}`,{exact:true})
 if(await control.isVisible())await control.selectOption(value)
 else await scope.getByRole('listbox',{name:`Образцы шрифтов: ${label}`,exact:true}).locator(`[data-font="${value}"]`).click()
}
export async function chooseFromSelect(control:Locator,value:string){
 if(await control.isVisible())await control.selectOption(value)
 else await control.locator('xpath=ancestor::div[@class="typography-controls"][1]').locator(`[data-font="${value}"]`).click()
}
