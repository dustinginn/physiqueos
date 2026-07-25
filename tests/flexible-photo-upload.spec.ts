import { expect, test } from "@playwright/test";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const files = (count:number,offset=0)=>Array.from({length:count},(_,index)=>({name:`pose-${index+offset}.png`,mimeType:"image/png",buffer:png}));
const duplicateFiles = (count:number)=>Array.from({length:count},()=>({name:"same-photo.png",mimeType:"image/png",buffer:png,lastModified:123456}));

async function disableRandomUUID(page) {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
  });
}

for (const width of [360,393]) {
  test(`six-photo review survives missing randomUUID at ${width}px`,async({page})=>{
    const errors:string[]=[];
    page.on("pageerror",(error)=>errors.push(error.message));
    await disableRandomUUID(page);
    await page.setViewportSize({width,height:844});
    await page.goto("/evidence/photos?goalId=goal_visible_abs_at_rest&confirmationPurpose=visible_abs_completion&numericalThresholdComplete=true&visualCriterionComplete=uncertain&criterion=lower_abs_visible_at_rest&requiredPose=front-relaxed");
    await page.locator('input[type="file"][multiple]').setInputFiles(duplicateFiles(6));
    const cards=page.getByTestId("photo-identity-card");
    await expect(cards).toHaveCount(6);
    const ids=await cards.evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute("data-draft-id")));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(6);
    await expect(page.getByText("Visible Abs confirmation")).toBeVisible();
    await expect(page.getByRole("button",{name:"Confirm every photo identity"})).toBeDisabled();
    const hasRuntimeOverlay=await page.locator("nextjs-portal").evaluateAll((nodes)=>nodes.some((node)=>node.shadowRoot?.textContent?.includes("crypto.randomUUID is not a function")));
    expect(hasRuntimeOverlay).toBe(false);
    expect(errors).toEqual([]);
  });
}

for (const width of [360,393,768,1280]) {
  test(`five-photo identity review fits at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto("/evidence/photos?goalId=goal_visible_abs_at_rest&confirmationPurpose=visible_abs_completion&numericalThresholdComplete=true&visualCriterionComplete=uncertain&criterion=lower_abs_visible_at_rest&requiredPose=front-relaxed");
    await page.locator('input[type="file"][multiple]').setInputFiles(files(5));
    await expect(page.getByTestId("photo-identity-card")).toHaveCount(5);
    await expect(page.getByText("Front Relaxed",{exact:true})).toBeVisible();
    await expect(page.getByText("Rear Flexed — Double Biceps",{exact:true})).toBeVisible();
    await expect(page.getByText("Side Relaxed",{exact:true})).toBeVisible();
    await expect(page.getByText("Front Flexed",{exact:true})).toBeVisible();
    for(const button of await page.getByRole("button",{name:"Confirm",exact:true}).all())await button.click();
    await expect(page.getByRole("button",{name:"Continue with 5 Photos"})).toBeEnabled();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    const action=page.getByRole("button",{name:"Continue with 5 Photos"});
    const box=await action.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
}

for (const width of [360,393]) {
  test(`five-view mixed Photo Event fits at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto("/lab/photo-completion?flexible=1");
    await expect(page.getByText("Compared with prior photos")).toBeVisible();
    await expect(page.getByText("New baseline views")).toBeVisible();
    await expect(page.getByTestId("new-pose-baseline")).toHaveCount(2);
    await expect(page.getByText("Side Relaxed",{exact:true}).first()).toBeVisible();
    await expect(page.getByText("Front Flexed",{exact:true}).first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
  });
}

test("photos can be added, removed, replaced, and reordered before confirmation",async({page})=>{
  await page.goto("/evidence/photos");
  const picker=page.locator('input[type="file"][multiple]');
  await picker.setInputFiles(files(1));
  await picker.setInputFiles(files(2,1));
  await expect(page.getByTestId("photo-identity-card")).toHaveCount(3);
  await page.getByRole("button",{name:"Move photo down"}).first().click();
  await page.getByRole("button",{name:"Remove"}).first().click();
  await expect(page.getByTestId("photo-identity-card")).toHaveCount(2);
  await page.getByText("Replace").first().locator('input[type="file"]').setInputFiles(files(1,9));
  await expect(page.getByText("edited",{exact:true}).first()).toBeVisible();
});

test("draft IDs remain stable through edits and change only for replacement",async({page})=>{
  await disableRandomUUID(page);
  await page.goto("/evidence/photos");
  await page.locator('input[type="file"][multiple]').setInputFiles(duplicateFiles(3));
  const cards=page.getByTestId("photo-identity-card");
  const initial=await cards.evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute("data-draft-id")));
  await page.getByRole("button",{name:"Move photo down"}).first().click();
  const reordered=await cards.evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute("data-draft-id")));
  expect(reordered).toEqual([initial[1],initial[0],initial[2]]);
  await cards.nth(0).getByLabel("Orientation").selectOption("right_side");
  await cards.nth(0).getByPlaceholder("Optional tags, separated by commas").fill("final, relaxed");
  await cards.nth(0).getByRole("button",{name:"Confirm",exact:true}).click();
  expect(await cards.nth(0).getAttribute("data-draft-id")).toBe(initial[1]);
  await cards.nth(1).getByText("Replace").locator('input[type="file"]').setInputFiles(files(1,10));
  const replaced=await cards.evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute("data-draft-id")));
  expect(replaced[0]).toBe(initial[1]);
  expect(replaced[1]).not.toBe(initial[0]);
  expect(replaced[2]).toBe(initial[2]);
  await cards.nth(0).getByRole("button",{name:"Remove"}).click();
  expect(await cards.evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute("data-draft-id")))).toEqual([replaced[1],replaced[2]]);
});

test("selection never silently confirms suggested identities",async({page})=>{
  await page.goto("/evidence/photos");
  await page.locator('input[type="file"][multiple]').setInputFiles(files(1));
  await expect(page.getByText("suggested",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Confirm every photo identity"})).toBeDisabled();
});
