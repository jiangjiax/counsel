const { chromium } = require('playwright');

const API_BASE = 'http://localhost:3000';

// The entrepreneur's question
const QUESTION = "我是一名创业者，想要开发一个AI驱动的项目管理工具，目标用户是中小企业。我应该如何验证这个想法的市场需求？";

// Simulated user answers for facilitator questions (Step 2)
const FACILITATOR_ANSWERS = [
  "我的产品是帮助中小企业管理项目的，核心痛点是任务分配不清、进度不透明。",
  "中小企业通常用Excel或简单工具管理项目，缺少智能化功能。",
  "我的差异化是AI自动排程和风险预警。",
];

function getCurrentTime() {
  return new Date().toISOString().substring(11, 23);
}

function logTime(step, message) {
  console.log(`[${getCurrentTime()}] Step ${step}: ${message}`);
}

async function waitForStepComplete(page, projectId, sessionId, step, maxWaitMs = 180000) {
  const startTime = Date.now();
  const checkInterval = 3000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}`);
      const session = await res.json();

      if (session.current_step > step) {
        return true;
      }
    } catch (e) {
      // ignore
    }
    await page.waitForTimeout(checkInterval);
    console.log(`  ... still running (${Math.round((Date.now() - startTime)/1000)}s)`);
  }
  return false;
}

async function runTest() {
  console.log('================================================');
  console.log('Counsel App Full Flow Test with MiniMax + Simulation');
  console.log('================================================');
  console.log(`Time tracking enabled\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let projectId, sessionId;
  const timings = {};

  try {
    // ===== Step 0: Setup =====
    logTime(0, 'Starting test...');

    console.log('\n[Project Setup] Creating project...');
    const startSetup = Date.now();
    const projectRes = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MiniMax Full Simulation' })
    });
    const project = await projectRes.json();
    projectId = project.id;
    timings.setup = Date.now() - startSetup;
    console.log(`  Project ID: ${projectId} (${timings.setup}ms)`);

    console.log('\n[Session Setup] Creating session with question...');
    const startSession = Date.now();
    const sessionRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_input: QUESTION })
    });
    const session = await sessionRes.json();
    sessionId = session.id;
    timings.session = Date.now() - startSession;
    console.log(`  Session ID: ${sessionId} (${timings.session}ms)`);

    // ===== Step 2: Define (with facilitator simulation) =====
    logTime(2, 'Starting Define phase with facilitator dialogue...');

    // First call to start the dialogue
    const startStep2 = Date.now();
    console.log('\n  [Turn 1] Initiating define...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '' })
    });

    // Wait for facilitator response
    await page.waitForTimeout(10000);

    // Simulate user answering facilitator questions (3 turns)
    for (let i = 0; i < FACILITATOR_ANSWERS.length; i++) {
      console.log(`\n  [Turn ${i+2}] User answers: "${FACILITATOR_ANSWERS[i].substring(0, 30)}..."`);
      await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: FACILITATOR_ANSWERS[i] })
      });
      await page.waitForTimeout(10000);
    }

    // Wait for step 2 to complete
    await waitForStepComplete(page, projectId, sessionId, 2, 120000);

    timings.step2 = Date.now() - startStep2;
    console.log(`\n  Step 2 Define COMPLETED (${timings.step2}ms)`);

    // Check define output
    const defineRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/01-defined.md`);
    const defineContent = await defineRes.text();
    console.log(`\n  --- Define Output (${defineContent.length} chars) ---`);
    console.log(defineContent.substring(0, 300) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-mm-02-define.png' });

    // ===== Step 3: Facts (with persona question simulation) =====
    logTime(3, 'Starting Facts phase with persona Q&A...');
    const startStep3 = Date.now();

    console.log('\n  Running 12 personas to ask questions...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    // Wait for all 12 personas to complete
    await waitForStepComplete(page, projectId, sessionId, 3, 180000);

    timings.step3 = Date.now() - startStep3;
    console.log(`\n  Step 3 Facts COMPLETED (${timings.step3}ms)`);

    const factsRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/02-facts-answers.md`);
    const factsContent = await factsRes.text();
    console.log(`\n  --- Facts Output (${factsContent.length} chars) ---`);
    console.log(factsContent.substring(0, 400) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-mm-03-facts.png' });

    // ===== Step 4: Opinions =====
    logTime(4, 'Starting Opinions phase...');
    const startStep4 = Date.now();

    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/4`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    await waitForStepComplete(page, projectId, sessionId, 4, 300000);

    timings.step4 = Date.now() - startStep4;
    console.log(`\n  Step 4 Opinions COMPLETED (${timings.step4}ms)`);

    const opinionsRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/04-dimensions.md`);
    const opinionsContent = await opinionsRes.text();
    console.log(`\n  --- Dimensions Output (${opinionsContent.length} chars) ---`);
    console.log(opinionsContent.substring(0, 300) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-mm-04-opinions.png' });

    // ===== Step 5: Deep Dive =====
    logTime(5, 'Starting Deep Dive phase...');
    const startStep5 = Date.now();

    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    await waitForStepComplete(page, projectId, sessionId, 5, 120000);

    timings.step5 = Date.now() - startStep5;
    console.log(`\n  Step 5 Deep Dive COMPLETED (${timings.step5}ms)`);

    await page.screenshot({ path: '/tmp/counsel-mm-05-deepdive.png' });

    // ===== Step 6: Debate (with debate simulation) =====
    logTime(6, 'Starting Debate phase with persona positions...');
    const startStep6 = Date.now();

    console.log('\n  Running debate on 2 dimensions with all 12 personas taking positions...');
    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/6`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_dimensions: [0, 1] })
    });

    await waitForStepComplete(page, projectId, sessionId, 6, 300000);

    timings.step6 = Date.now() - startStep6;
    console.log(`\n  Step 6 Debate COMPLETED (${timings.step6}ms)`);

    const debateRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/05-debate.md`);
    const debateContent = await debateRes.text();
    console.log(`\n  --- Debate Output (${debateContent.length} chars) ---`);
    console.log(debateContent.substring(0, 400) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-mm-06-debate.png' });

    // ===== Step 7: Summary =====
    logTime(7, 'Starting Summary phase...');
    const startStep7 = Date.now();

    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    await waitForStepComplete(page, projectId, sessionId, 7, 120000);

    timings.step7 = Date.now() - startStep7;
    console.log(`\n  Step 7 Summary COMPLETED (${timings.step7}ms)`);

    const summaryRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/06-summary.md`);
    const summaryContent = await summaryRes.text();
    console.log(`\n  --- Summary Output (${summaryContent.length} chars) ---`);
    console.log(summaryContent.substring(0, 400) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-mm-07-summary.png' });

    // ===== Step 8: Harvest =====
    logTime(8, 'Starting Harvest phase...');
    const startStep8 = Date.now();

    await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/steps/8`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    await waitForStepComplete(page, projectId, sessionId, 8, 180000);

    timings.step8 = Date.now() - startStep8;
    console.log(`\n  Step 8 Harvest COMPLETED (${timings.step8}ms)`);

    const harvestRes = await fetch(`${API_BASE}/api/projects/${projectId}/sessions/${sessionId}/files/07-harvest.md`);
    const harvestContent = await harvestRes.text();
    console.log(`\n  --- Harvest Output (${harvestContent.length} chars) ---`);
    console.log(harvestContent.substring(0, 600) + '...\n');

    await page.screenshot({ path: '/tmp/counsel-mm-08-harvest.png' });

    // ===== Final Report =====
    const totalTime = timings.step2 + timings.step3 + timings.step4 + timings.step5 + timings.step6 + timings.step7 + timings.step8;

    console.log('\n================================================');
    console.log('MINIMAX TEST COMPLETED - PERFORMANCE SUMMARY');
    console.log('================================================');
    console.log(`Model: MiniMax-Text-01`);
    console.log(`Question: ${QUESTION.substring(0, 50)}...`);
    console.log('\n--- Time Breakdown ---');
    console.log(`Step 2 (Define):      ${timings.step2.toLocaleString()}ms (${(timings.step2/1000).toFixed(1)}s)`);
    console.log(`Step 3 (Facts):       ${timings.step3.toLocaleString()}ms (${(timings.step3/1000).toFixed(1)}s)`);
    console.log(`Step 4 (Opinions):    ${timings.step4.toLocaleString()}ms (${(timings.step4/1000).toFixed(1)}s)`);
    console.log(`Step 5 (Deep Dive):   ${timings.step5.toLocaleString()}ms (${(timings.step5/1000).toFixed(1)}s)`);
    console.log(`Step 6 (Debate):      ${timings.step6.toLocaleString()}ms (${(timings.step6/1000).toFixed(1)}s)`);
    console.log(`Step 7 (Summary):     ${timings.step7.toLocaleString()}ms (${(timings.step7/1000).toFixed(1)}s)`);
    console.log(`Step 8 (Harvest):      ${timings.step8.toLocaleString()}ms (${(timings.step8/1000).toFixed(1)}s)`);
    console.log('--------------------');
    console.log(`TOTAL (Steps 2-8):    ${totalTime.toLocaleString()}ms (${(totalTime/1000).toFixed(1)}s)`);
    console.log('================================================');
    console.log(`\nScreenshots saved to /tmp/counsel-mm-*.png`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Project ID: ${projectId}`);

  } catch (error) {
    console.error('\n!!! ERROR !!!');
    console.error(error.message);
    await page.screenshot({ path: '/tmp/counsel-mm-ERROR.png' });
  } finally {
    await browser.close();
  }
}

runTest().catch(console.error);
