const { chromium } = require('playwright');

const API_BASE = 'http://localhost:3000';

// Entrepreneur persona: Building a SaaS startup
const QUESTION = "我是一名创业者，想要开发一个AI驱动的项目管理工具，目标用户是中小企业。我应该如何验证这个想法的市场需求？";

async function runTest() {
  console.log('Starting Counsel App Full Flow Test...');
  console.log('======================================');
  console.log('Simulating: Entrepreneur with market validation question');
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let projectId, sessionId;

  try {
    // Step 1: Open the app
    console.log('[Step 0] Opening Counsel app...');
    await page.goto(`${API_BASE}/session.html`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/counsel-00-initial.png' });
    console.log('  Screenshot: counsel-00-initial.png');

    // Step 2: Create project via API
    console.log('\n[Project Setup] Creating project...');
    const projectRes = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Entrepreneur SaaS Test' })
    });
    const project = await projectRes.json();
    projectId = project.id;
    console.log(`  Project ID: ${projectId}`);

    // Step 3: Create session with the question (raw_input required)
    console.log('\n[Session Setup] Creating session...');
    const sessionRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_input: QUESTION })
    });
    const session = await sessionRes.json();
    sessionId = session.id;
    console.log(`  Session ID: ${sessionId}`);

    await page.screenshot({ path: '/tmp/counsel-01-session-created.png' });
    console.log('  Screenshot: counsel-01-session-created.png');

    // Step 4: Run Step 2 - Define
    console.log('\n[Step 2] Running Define (problem definition)...');
    const step2Res = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '' })
    });
    console.log(`  Response status: ${step2Res.status}`);
    await page.waitForTimeout(15000); // Wait for AI processing with Ollama

    // Check define output (file is 01-defined.md not 02-define.md)
    const defineRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/01-defined.md`);
    const defineContent = await defineRes.text();
    console.log('\n  --- Define Output (preview) ---');
    console.log(defineContent.substring(0, 500) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-02-step2-define.png' });
    console.log('  Screenshot: counsel-02-step2-define.png');

    // Step 5: Run Step 3 - Facts
    console.log('[Step 3] Running Facts (gathering evidence)...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await page.waitForTimeout(15000);

    const factsRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/02-facts-answers.md`);
    const factsContent = await factsRes.text();
    console.log('  --- Facts Output (preview) ---');
    console.log(factsContent.substring(0, 500) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-03-step3-facts.png' });
    console.log('  Screenshot: counsel-03-step3-facts.png');

    // Step 6: Run Step 4 - Opinions (creates 03-opinions/ directory)
    console.log('[Step 4] Running Opinions (multiple perspectives)...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/4`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await page.waitForTimeout(15000);

    const opinionsRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/04-dimensions.md`);
    const opinionsContent = await opinionsRes.text();
    console.log('  --- Dimensions Output (preview) ---');
    console.log(opinionsContent.substring(0, 500) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-04-step4-dimensions.png' });
    console.log('  Screenshot: counsel-04-step4-dimensions.png');

    // Step 7: Run Step 5 - Deep Dive
    console.log('[Step 5] Running Deep Dive (detailed exploration)...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await page.waitForTimeout(15000);

    const deepRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/05-deep-dive.md`);
    const deepContent = await deepRes.text();
    console.log('  --- Deep Dive Output (preview) ---');
    console.log(deepContent.substring(0, 500) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-05-step5-deepdive.png' });
    console.log('  Screenshot: counsel-05-step5-deepdive.png');

    // Step 8: Run Step 6 - Debate (select 2 dimensions)
    console.log('[Step 6] Running Debate (testing assumptions)...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/6`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_dimensions: [0, 1] })
    });
    await page.waitForTimeout(20000); // Debate takes longer

    const debateRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/06-debate.md`);
    const debateContent = await debateRes.text();
    console.log('  --- Debate Output (preview) ---');
    console.log(debateContent.substring(0, 500) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-06-step6-debate.png' });
    console.log('  Screenshot: counsel-06-step6-debate.png');

    // Step 9: Run Step 7 - Summary
    console.log('[Step 7] Running Summary...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await page.waitForTimeout(15000);

    const summaryRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/07-summary.md`);
    const summaryContent = await summaryRes.text();
    console.log('  --- Summary Output (preview) ---');
    console.log(summaryContent.substring(0, 500) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-07-step7-summary.png' });
    console.log('  Screenshot: counsel-07-step7-summary.png');

    // Step 10: Run Step 8 - Harvest
    console.log('[Step 8] Running Harvest (action items)...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/8`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await page.waitForTimeout(15000);

    const harvestRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/08-harvest.md`);
    const harvestContent = await harvestRes.text();
    console.log('  --- Harvest Output ---');
    console.log(harvestContent.substring(0, 800) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-08-step8-harvest.png' });
    console.log('  Screenshot: counsel-08-step8-harvest.png');

    // Final session state
    const finalSession = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}`);
    const sessionData = await finalSession.json();
    console.log('\n======================================');
    console.log('FINAL SESSION STATE:');
    console.log(`  Step: ${sessionData.current_step || 'N/A'}`);
    console.log(`  Created: ${sessionData.created_at || 'N/A'}`);
    console.log('======================================');

    console.log('\nALL SCREENSHOTS SAVED TO /tmp/counsel-*.png');
    console.log('\nTEST COMPLETED SUCCESSFULLY!');

  } catch (error) {
    console.error('\n!!! ERROR !!!');
    console.error(error.message);
    console.error(error.stack);
    await page.screenshot({ path: '/tmp/counsel-ERROR.png' });
    console.log('\nError screenshot: /tmp/counsel-ERROR.png');
  } finally {
    await browser.close();
  }
}

runTest().catch(console.error);
