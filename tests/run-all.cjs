const {spawnSync}=require('node:child_process');
const files=[
  "tests/order-tools.cjs",
  "tests/design-editing.cjs",
  "tests/design-editing-browser.cjs",
  "tests/presentation-order.cjs",
  "tests/presentation-live.cjs",
  "tests/two-devices.cjs",
  "tests/collaboration-core.cjs",
  "tests/product-pricing.cjs",
  "tests/garment-notes.cjs",
  "tests/design-batch.cjs",
  "tests/bulk-prices.cjs",
  "tests/individual-prices.cjs",
  "tests/person-order.cjs",
  "tests/unified-order.cjs",
  "tests/order-designs.cjs",
  "tests/product-pricing-browser.cjs",
  "tests/smoke.cjs",
  "tests/upgrade.cjs",
  "tests/workshop.cjs",
  "tests/design-labels.cjs",
  "tests/labels-letter.cjs",
  "tests/quote-profit.cjs",
  "tests/quote-review.cjs",
  "tests/preview.cjs",
  "tests/lifecycle.cjs",
  "tests/closing-cuts.cjs",
  "tests/operations.cjs",
  "tests/proposal-workflow.cjs"
];
const failed=[];for(const file of files){const r=spawnSync(process.execPath,[file],{stdio:'inherit',timeout:180000});if(r.error||r.status!==0){console.error('FAILED:',file,r.error?.message||r.status);failed.push(file);}}
if(failed.length){console.error('Failing areas:',failed.join(', '));process.exitCode=1;}
