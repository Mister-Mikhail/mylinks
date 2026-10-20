import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { cropImageStyle, frameCrop, legacyToFrame } from '../src/lib/imageCrop.ts'
test('fractional frame geometry survives 1280/390/320 widths, zoom below cover and noncentral offsets',()=>{
 const crop={...frameCrop(16/9,2),zoom:.5,x:.125,y:-.2}
 const style=cropImageStyle(crop)
 for(const width of [1280,390,320]){
  const height=width/crop.aspect
  const iw=parseFloat(String(style.width))/100*width,ih=parseFloat(String(style.height))/100*height
  assert.ok(Math.abs(iw/width-Math.max(1,crop.sourceAspect/crop.aspect)*crop.zoom)<1e-10)
  assert.ok(Math.abs(ih/height-Math.max(1,crop.aspect/crop.sourceAspect)*crop.zoom)<1e-10)
  assert.ok(Math.abs((parseFloat(String(style.left))/100*width-width/2)/width-crop.x)<1e-10)
 }
})
test('legacy object-position maps to the same rectangle before Apply',()=>{
 const c=legacyToFrame({version:1,mode:'legacy',x:.3,y:.6,zoom:1},16/9,2)
 const renderedWidth=2/(16/9),renderedHeight=1
 assert.ok(Math.abs((.5+c.x-renderedWidth/2)-(1-renderedWidth)*.3)<1e-10)
 assert.ok(Math.abs((.5+c.y-renderedHeight/2)-(1-renderedHeight)*.6)<1e-10)
})
