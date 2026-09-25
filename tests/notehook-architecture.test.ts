import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeCatalogueSection,
  buildPinnedKnowledgeSection,
  buildDynamicReferencedSection,
  generateNotehookResponse,
  getReferencedPagesFromPrompt,
  expandKnowledgePage,
  KNOWLEDGE_EXPANSION_TOOL_GEMINI,
  KNOWLEDGE_EXPANSION_TOOL_OPENAI,
} from '../lib/ai-notehook';
import { Page, AISettings } from '../lib/types';

describe('AI Notehook Architecture & Prefix Caching Tests', () => {
  const dummySettings: AISettings = {
    provider: 'simulated',
    apiKey: '',
    model: '',
  };

  const samplePages: Page[] = [
    {
      id: 'page-auth',
      short_id: 'e1',
      type: 'entity',
      title: 'Auth Service',
      content: 'Core authentication service using JWT tokens.',
      created_at: '2026-09-20T00:00:00.000Z',
      updated_at: '2026-09-20T00:00:00.000Z',
    },
    {
      id: 'page-db',
      short_id: 'e2',
      type: 'entity',
      title: 'PostgreSQL DB',
      content: 'PostgreSQL 16 database configuration and pool settings.',
      created_at: '2026-09-21T00:00:00.000Z',
      updated_at: '2026-09-21T00:00:00.000Z',
    },
    {
      id: 'page-decision',
      short_id: 'd1',
      type: 'decision',
      title: 'Cap Pool Size at 20',
      content: 'Connection pool is capped at 20 to avoid exhaustion.',
      created_at: '2026-09-22T00:00:00.000Z',
      updated_at: '2026-09-22T00:00:00.000Z',
    },
    {
      id: 'page-note',
      short_id: 'n1',
      type: 'note',
      title: 'Sprint Notes',
      content: 'Discussion notes for Q3 sprint planning.',
      created_at: '2026-09-23T00:00:00.000Z',
      updated_at: '2026-09-23T00:00:00.000Z',
    },
    {
      id: 'page-msg',
      short_id: 'm1',
      type: 'message',
      title: 'Past Chat Message',
      content: 'This is a past message and should never be in the catalogue.',
      created_at: '2026-09-24T00:00:00.000Z',
    },
  ];

  it('1. Decouples catalogue from pin state (Tier 2 stays 100% stable)', () => {
    // Catalogue without any pinned pages
    const catalogueBeforePin = buildKnowledgeCatalogueSection(samplePages);

    // Catalogue when page-auth and page-db are pinned
    const catalogueAfterPin = buildKnowledgeCatalogueSection(samplePages);

    assert.equal(
      catalogueBeforePin,
      catalogueAfterPin,
      'Catalogue output must be identical regardless of pin state'
    );
    assert.match(catalogueBeforePin, /\[@Auth Service\]/);
    assert.match(catalogueBeforePin, /\[@PostgreSQL DB\]/);
    assert.doesNotMatch(catalogueBeforePin, /Past Chat Message/, 'Messages must be excluded from catalogue');
  });

  it('2. Caps pinned session anchors at maximum 3 knowledge pages', () => {
    const manyPinned = ['page-auth', 'page-db', 'page-decision', 'page-note'];
    const pinnedSection = buildPinnedKnowledgeSection(samplePages, manyPinned);

    // Count how many "### PINNED" headers exist
    const pinnedHeaders = pinnedSection.match(/### PINNED/g) || [];
    assert.equal(pinnedHeaders.length, 3, 'Must cap pinned items at 3');
  });

  it('3. Deduplicates verbatim history references (avoids re-injecting unchanged pages)', async () => {
    // Turn 1 referenced @Auth Service
    const turn1Date = '2026-09-24T10:00:00.000Z';
    const turn1Message: Page = {
      id: 'turn-1',
      type: 'message',
      role: 'assistant',
      title: 'Auth Discussion',
      user_prompt: 'How does [@Auth Service] work?',
      content: 'Here is the auth overview...',
      injected_context: `=== REFERENCED CONTEXT FOR THIS TURN ===\n--- REFERENCED PAGE: [@Auth Service] (ID: e1) [type: entity] ---\nContent:\nCore authentication service using JWT tokens.\n--- END REFERENCED PAGE ---\n=== END REFERENCED CONTEXT ===`,
      referenced_page_ids: ['page-auth'],
      created_at: turn1Date,
    };

    const allPagesWithTurn1 = [...samplePages, turn1Message];

    // Turn 2 references @Auth Service again, but @Auth Service has NOT changed (updated_at is 2026-09-20 <= turn1)
    const turn2Result = await generateNotehookResponse(
      'Can you remind me about [@Auth Service] token expiry?',
      [],
      dummySettings,
      undefined,
      [],
      allPagesWithTurn1,
      []
    );

    // Because Auth Service is already present verbatim in history and unchanged, it should NOT be re-injected
    assert.equal(
      turn2Result.injectedContext,
      undefined,
      'Should not re-inject Auth Service when already verbatim and unchanged in history'
    );
    assert.equal(
      turn2Result.referencedPageIds,
      undefined,
      'referencedPageIds should be undefined when nothing was injected'
    );
  });

  it('4. Cleans stale reference blocks from history and re-injects fresh version when a page changes', async () => {
    const turn1Date = '2026-09-24T10:00:00.000Z';
    const turn1Message: Page = {
      id: 'turn-1',
      type: 'message',
      role: 'assistant',
      title: 'Auth Discussion',
      user_prompt: 'How does [@Auth Service] work?',
      content: 'Here is the auth overview...',
      injected_context: `=== REFERENCED CONTEXT FOR THIS TURN ===\n--- REFERENCED PAGE: [@Auth Service] (ID: e1) [type: entity] ---\nContent:\nCore authentication service using JWT tokens.\n--- END REFERENCED PAGE ---\n=== END REFERENCED CONTEXT ===`,
      referenced_page_ids: ['page-auth'],
      created_at: turn1Date,
    };

    // Now update Auth Service AFTER Turn 1
    const updatedAuthPage: Page = {
      ...samplePages[0],
      content: 'NEW UPDATED AUTH SPEC: Switched to EdDSA and cookie encryption.',
      updated_at: '2026-09-24T12:00:00.000Z', // newer than turn1Date
    };

    const allPagesUpdated = [
      updatedAuthPage,
      ...samplePages.slice(1),
      turn1Message,
    ];

    const turn2Result = await generateNotehookResponse(
      'Can you explain the new [@Auth Service] spec?',
      [],
      dummySettings,
      undefined,
      [],
      allPagesUpdated,
      []
    );

    // Because Auth Service changed, Turn 2 MUST re-inject the fresh version
    assert.ok(turn2Result.injectedContext, 'Must re-inject fresh context when page changed');
    assert.match(turn2Result.injectedContext, /NEW UPDATED AUTH SPEC/);
    assert.deepEqual(turn2Result.referencedPageIds, ['page-auth']);
  });

  it('5. Handles entity canonical version updates correctly (detects version changes even if page body unchanged)', async () => {
    const turn1Date = '2026-09-24T10:00:00.000Z';

    const entityWithVersions: Page = {
      id: 'page-versioned-entity',
      short_id: 'e9',
      type: 'entity',
      title: 'Payment Gateway',
      content: 'Payment Gateway Base Body',
      canonical_version_id: 'ver-1',
      versions: [
        {
          id: 'ver-1',
          entity_id: 'page-versioned-entity',
          version_num: 1,
          title: 'Stripe v1 Integration',
          content: 'Initial Stripe charges API integration.',
          created_at: '2026-09-20T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
          is_canonical: true,
        },
      ],
      created_at: '2026-09-20T00:00:00.000Z',
      updated_at: '2026-09-20T00:00:00.000Z',
    };

    const turn1Message: Page = {
      id: 'turn-1',
      type: 'message',
      role: 'assistant',
      title: 'Payment Discussion',
      user_prompt: 'How does [@Payment Gateway] work?',
      content: 'Here is the payment plan...',
      injected_context: `=== REFERENCED CONTEXT FOR THIS TURN ===\n--- REFERENCED PAGE: [@Payment Gateway] (ID: e9) [type: entity] ---\nContent:\nPayment Gateway Base Body\n\n[Active Version "Stripe v1 Integration"]: Initial Stripe charges API integration.\n--- END REFERENCED PAGE ---\n=== END REFERENCED CONTEXT ===`,
      referenced_page_ids: ['page-versioned-entity'],
      created_at: turn1Date,
    };

    // User adds Version 2 (Payment Intents API) and switches canonical version AFTER Turn 1
    const updatedEntityWithVer2: Page = {
      ...entityWithVersions,
      // Base content stays the same!
      content: 'Payment Gateway Base Body',
      canonical_version_id: 'ver-2',
      versions: [
        {
          id: 'ver-1',
          entity_id: 'page-versioned-entity',
          version_num: 1,
          title: 'Stripe v1 Integration',
          content: 'Initial Stripe charges API integration.',
          created_at: '2026-09-20T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
          is_canonical: false,
        },
        {
          id: 'ver-2',
          entity_id: 'page-versioned-entity',
          version_num: 2,
          title: 'Stripe PaymentIntents v2',
          content: 'Modern PaymentIntents flow with 3D Secure.',
          created_at: '2026-09-24T14:00:00.000Z', // newer than turn1Date!
          updated_at: '2026-09-24T14:00:00.000Z',
          is_canonical: true,
        },
      ],
      updated_at: '2026-09-24T14:00:00.000Z',
    };

    const allPagesWithNewVersion = [updatedEntityWithVer2, turn1Message];

    const turn2Result = await generateNotehookResponse(
      'What is the status of [@Payment Gateway]?',
      [],
      dummySettings,
      undefined,
      [],
      allPagesWithNewVersion,
      []
    );

    // Must detect the canonical version change, strip stale ver-1, and re-inject ver-2
    assert.ok(turn2Result.injectedContext, 'Must re-inject when canonical version changed');
    assert.match(turn2Result.injectedContext, /Stripe PaymentIntents v2/);
    assert.match(turn2Result.injectedContext, /Modern PaymentIntents flow with 3D Secure/);
  });

  it('6. Does not inject pinned pages into dynamic turn reference section (Tier 4)', async () => {
    // If Auth Service is pinned in Tier 3, mentioning it in current turn prompt should NOT put it in Tier 4
    const result = await generateNotehookResponse(
      'Can you review [@Auth Service]?',
      [],
      dummySettings,
      undefined,
      [],
      samplePages,
      ['page-auth'] // pinned
    );

    assert.equal(
      result.injectedContext,
      undefined,
      'Pinned page should not be re-injected in Tier 4 dynamic context'
    );
  });

  it('7. MentionIndex resolves mentions in O(L) time across short IDs, titles, and typed tags', () => {
    const prompt = 'Please check [@e1] alongside @PostgreSQL DB and [@decision: Cap Pool Size at 20] for performance.';
    const referenced = getReferencedPagesFromPrompt(prompt, samplePages);

    const referencedIds = referenced.map((p) => p.id).sort();
    assert.deepEqual(
      referencedIds,
      ['page-auth', 'page-db', 'page-decision'].sort(),
      'Must resolve all 3 referenced pages accurately'
    );
  });

  it('8. MentionIndex Trie correctly handles longest-prefix matches and avoids false substrings', () => {
    const pages: Page[] = [
      {
        id: 'p-auth',
        short_id: 'e10',
        type: 'entity',
        title: 'Auth',
        content: 'Auth base',
        created_at: '2026-09-20T00:00:00.000Z',
      },
      {
        id: 'p-auth-service',
        short_id: 'e11',
        type: 'entity',
        title: 'Auth Service',
        content: 'Auth Service full',
        created_at: '2026-09-20T00:00:00.000Z',
      },
    ];

    // Longest prefix match should resolve "Auth Service", not just "Auth"
    const matchLongest = getReferencedPagesFromPrompt('How does @Auth Service connect to external identity?', pages);
    assert.equal(matchLongest.length, 1);
    assert.equal(matchLongest[0].id, 'p-auth-service');

    // Prompt mentioning "@author" must NOT match "@Auth"
    const noFalsePositive = getReferencedPagesFromPrompt('Contact the @author for permissions.', pages);
    assert.equal(noFalsePositive.length, 0, '@author must not match @Auth');

    // Prompt mentioning "@Auth" specifically
    const matchAuth = getReferencedPagesFromPrompt('Check @Auth configuration.', pages);
    assert.equal(matchAuth.length, 1);
    assert.equal(matchAuth[0].id, 'p-auth');
  });

  it('9. Deduplicates message pages (e.g. m3) already in active history buffer, but injects older messages outside buffer', async () => {
    // Create 16 message turns: m1 is old (dropped from 15-turn window), m2..m16 are active
    const messages: Page[] = [];
    for (let i = 1; i <= 16; i++) {
      messages.push({
        id: `msg-${i}`,
        short_id: `m${i}`,
        type: 'message',
        role: 'assistant',
        title: `Topic ${i}`,
        user_prompt: `User question ${i}`,
        content: `Answer body for turn ${i}`,
        created_at: new Date(Date.UTC(2026, 8, 20, 10, i, 0)).toISOString(),
      });
    }

    // 1. Mentioning @m5 (which is inside the 12-turn active verbatim buffer)
    const resultRecent = await generateNotehookResponse(
      'What did you say in [@m5]?',
      [],
      dummySettings,
      undefined,
      [],
      messages,
      []
    );
    // Since m5 is already present verbatim in active history, it must NOT be duplicate-injected into Tier 4
    assert.equal(
      resultRecent.injectedContext,
      undefined,
      'Recent message m5 must not be re-injected since it is already in verbatim history'
    );

    // 2. Mentioning @m1 (which is turn 1, outside the 15-turn buffer)
    const resultOld = await generateNotehookResponse(
      'What did you say in [@m1]?',
      [],
      dummySettings,
      undefined,
      [],
      messages,
      []
    );
    // Since m1 fell out of the 15-turn window, it MUST be injected into Tier 4 on-demand
    assert.ok(resultOld.injectedContext, 'Old message m1 outside history buffer must be injected on-demand');
    assert.match(resultOld.injectedContext, /Answer body for turn 1/);
  });

  it('10. Deduplicates unchanged todos generated in past turns, but re-injects when marked done or updated', async () => {
    const turn1Time = '2026-09-24T10:00:00.000Z';
    const turn1Message: Page = {
      id: 'turn-1',
      type: 'message',
      role: 'assistant',
      title: 'Database Setup',
      user_prompt: 'What are the database action items?',
      content: 'Here are the tasks: [@todo: Set up database connection pool]',
      created_at: turn1Time,
    };

    const todoPage: Page = {
      id: 'todo-db-pool',
      short_id: 't1',
      type: 'todo',
      title: 'Set up database connection pool',
      content: 'Set up database connection pool',
      done: false,
      starred: false,
      created_at: turn1Time,
      updated_at: turn1Time,
    };

    // Case A: User asks about @t1 while it is unedited/pending. It is already in Turn 1's content.
    const resultUnchanged = await generateNotehookResponse(
      'Can you help me with [@t1]?',
      [],
      dummySettings,
      undefined,
      [],
      [todoPage, turn1Message],
      []
    );
    assert.equal(
      resultUnchanged.injectedContext,
      undefined,
      'Unchanged todo already present in history turn must not be re-injected'
    );

    // Case B: User marks todo as COMPLETED (done: true, updated_at updated after turn 1)
    const completedTodo: Page = {
      ...todoPage,
      done: true,
      updated_at: '2026-09-24T11:00:00.000Z', // newer than turn1
    };

    const resultCompleted = await generateNotehookResponse(
      'What is the status of [@t1]?',
      [],
      dummySettings,
      undefined,
      [],
      [completedTodo, turn1Message],
      []
    );
    assert.ok(resultCompleted.injectedContext, 'Modified/completed todo must be re-injected with updated status');
    assert.match(resultCompleted.injectedContext, /\[Status: COMPLETED \/ DONE\]/);
  });

  it('11. Pushes re-injected changed pages to the end of the full text bodies list', async () => {
    const turn1Time = '2026-09-24T10:00:00.000Z';

    // Page Alpha was injected in Turn 1
    const pageAlpha: Page = {
      id: 'p-alpha',
      short_id: 'e1',
      type: 'entity',
      title: 'Alpha Architecture',
      content: 'Alpha initial specification',
      created_at: turn1Time,
      updated_at: turn1Time,
    };

    const turn1Message: Page = {
      id: 'turn-1',
      type: 'message',
      role: 'assistant',
      title: 'Alpha Discussion',
      user_prompt: 'Explain [@Alpha Architecture]',
      content: 'Here is alpha...',
      injected_context: `=== REFERENCED CONTEXT FOR THIS TURN ===\n--- REFERENCED PAGE: [@Alpha Architecture] (ID: e1) [type: entity] ---\nContent:\nAlpha initial specification\n--- END REFERENCED PAGE ---\n=== END REFERENCED CONTEXT ===`,
      referenced_page_ids: ['p-alpha'],
      created_at: turn1Time,
    };

    // Now Page Alpha is modified
    const pageAlphaModified: Page = {
      ...pageAlpha,
      content: 'Alpha updated v2 specification',
      updated_at: '2026-09-24T12:00:00.000Z',
    };

    // Page Zeta is a brand new page never mentioned before
    const pageZeta: Page = {
      id: 'p-zeta',
      short_id: 'e99',
      type: 'entity',
      title: 'Zeta Service',
      content: 'Zeta fresh specification',
      created_at: '2026-09-24T12:00:00.000Z',
    };

    // In Turn 2, user asks about both Alpha (modified, re-injected) and Zeta (fresh)
    const result = await generateNotehookResponse(
      'Compare [@Alpha Architecture] with [@Zeta Service]',
      [],
      dummySettings,
      undefined,
      [],
      [pageAlphaModified, pageZeta, turn1Message],
      []
    );

    assert.ok(result.injectedContext);
    // Zeta is fresh (new), Alpha is re-injected (changed).
    // Even though alphabetically "Alpha" comes before "Zeta", Zeta MUST be placed first and Alpha pushed to the end!
    const zetaIndex = result.injectedContext.indexOf('[@Zeta Service]');
    const alphaIndex = result.injectedContext.indexOf('[@Alpha Architecture]');

    assert.ok(zetaIndex !== -1, 'Zeta must be in injected context');
    assert.ok(alphaIndex !== -1, 'Alpha must be in injected context');
    assert.ok(
      zetaIndex < alphaIndex,
      `Fresh page (Zeta at index ${zetaIndex}) must appear BEFORE re-injected changed page (Alpha at index ${alphaIndex})`
    );
  });

  it('12. Extracts specific entity versions [@e1.2] and [@Auth Service.2], injecting specific version body instead of canonical', async () => {
    const entityWithVersions: Page = {
      id: 'page-auth-multi',
      short_id: 'e1',
      type: 'entity',
      title: 'Auth Service',
      content: 'Base auth description',
      canonical_version_id: 'v1',
      versions: [
        {
          id: 'v1',
          entity_id: 'page-auth-multi',
          version_num: 1,
          title: 'v1',
          content: 'Version 1 body: legacy JWT tokens.',
          created_at: '2026-09-20T00:00:00.000Z',
          is_canonical: true,
        },
        {
          id: 'v2',
          entity_id: 'page-auth-multi',
          version_num: 2,
          title: 'v2',
          content: 'Version 2 body: modern OAuth2 with PKCE.',
          created_at: '2026-09-21T00:00:00.000Z',
        },
        {
          id: 'v3',
          entity_id: 'page-auth-multi',
          version_num: 3,
          title: 'v3',
          content: 'Version 3 body: Passkeys and WebAuthn.',
          created_at: '2026-09-22T00:00:00.000Z',
        },
      ],
      created_at: '2026-09-20T00:00:00.000Z',
    };

    // Case A: User references specific short ID version [@e1.2]
    const referencedA = getReferencedPagesFromPrompt('How does [@e1.2] work?', [entityWithVersions]);
    assert.equal(referencedA.length, 1);
    assert.equal(referencedA[0].id, 'page-auth-multi');
    assert.equal(referencedA[0].target_version_num, 2);

    const resultA = await generateNotehookResponse(
      'How does [@e1.2] work?',
      [],
      dummySettings,
      undefined,
      [],
      [entityWithVersions],
      []
    );
    assert.ok(resultA.injectedContext);
    assert.match(resultA.injectedContext, /\[Version 2 "v2"\]: Version 2 body: modern OAuth2 with PKCE\./);
    assert.doesNotMatch(resultA.injectedContext, /Version 1 body/);

    // Case B: User references specific title version [@Auth Service.3]
    const referencedB = getReferencedPagesFromPrompt('Tell me about [@Auth Service.3]', [entityWithVersions]);
    assert.equal(referencedB.length, 1);
    assert.equal(referencedB[0].target_version_num, 3);

    const resultB = await generateNotehookResponse(
      'Tell me about [@Auth Service.3]',
      [],
      dummySettings,
      undefined,
      [],
      [entityWithVersions],
      []
    );
    assert.ok(resultB.injectedContext);
    assert.match(resultB.injectedContext, /\[Version 3 "v3"\]: Version 3 body: Passkeys and WebAuthn\./);
  });

  it('13. Supports entities titled with dot-number (e.g. title.3) and referencing its version with [@title.3.4]', async () => {
    const entityDotTitle: Page = {
      id: 'page-title-dot',
      short_id: 'e7',
      type: 'entity',
      title: 'Release.3',
      content: 'Release.3 base overview',
      canonical_version_id: 'v1',
      versions: [
        {
          id: 'v1',
          entity_id: 'page-title-dot',
          version_num: 1,
          title: 'v1',
          content: 'Release.3 version 1 details',
          created_at: '2026-09-20T00:00:00.000Z',
          is_canonical: true,
        },
        {
          id: 'v4',
          entity_id: 'page-title-dot',
          version_num: 4,
          title: 'v4',
          content: 'Release.3 version 4 hotfix details',
          created_at: '2026-09-21T00:00:00.000Z',
        },
      ],
      created_at: '2026-09-20T00:00:00.000Z',
    };

    // Referencing canonical entity [@Release.3]
    const referencedCanonical = getReferencedPagesFromPrompt('Look at [@Release.3]', [entityDotTitle]);
    assert.equal(referencedCanonical.length, 1);
    assert.equal(referencedCanonical[0].target_version_num, undefined);

    // Referencing specific version [@Release.3.4]
    const referencedVersion = getReferencedPagesFromPrompt('Look at [@Release.3.4]', [entityDotTitle]);
    assert.equal(referencedVersion.length, 1);
    assert.equal(referencedVersion[0].target_version_num, 4);

    const resultVersion = await generateNotehookResponse(
      'Look at [@Release.3.4]',
      [],
      dummySettings,
      undefined,
      [],
      [entityDotTitle],
      []
    );
    assert.ok(resultVersion.injectedContext);
    assert.match(resultVersion.injectedContext, /\[Version 4 "v4"\]: Release\.3 version 4 hotfix details/);
  });

  it('14. Deduplicates specific entity version mentions across conversation turns', async () => {
    const turn1Time = '2026-09-24T10:00:00.000Z';
    const entity: Page = {
      id: 'p-auth-dedup',
      short_id: 'e1',
      type: 'entity',
      title: 'Auth Service',
      content: 'Auth Service',
      canonical_version_id: 'v1',
      versions: [
        {
          id: 'v1',
          entity_id: 'p-auth-dedup',
          version_num: 1,
          title: 'v1',
          content: 'Version 1 body',
          created_at: turn1Time,
          is_canonical: true,
        },
        {
          id: 'v2',
          entity_id: 'p-auth-dedup',
          version_num: 2,
          title: 'v2',
          content: 'Version 2 body',
          created_at: turn1Time,
        },
      ],
      created_at: turn1Time,
      updated_at: turn1Time,
    };

    const turn1Message: Page = {
      id: 'turn-1',
      type: 'message',
      role: 'assistant',
      title: 'Auth V2 Discussion',
      user_prompt: 'How does [@Auth Service.2] work?',
      content: 'Here is version 2...',
      injected_context: `=== REFERENCED CONTEXT FOR THIS TURN ===\n--- REFERENCED PAGE: [@Auth Service.2] (ID: e1) [type: entity] ---\nContent:\nAuth Service\n\n[Version 2 "v2"]: Version 2 body\n--- END REFERENCED PAGE ---\n=== END REFERENCED CONTEXT ===`,
      referenced_page_ids: ['p-auth-dedup'],
      created_at: turn1Time,
    };

    // Turn 2: User asks about [@Auth Service.2] again. Since it was already injected in turn 1 and unchanged, deduplicate it.
    const resultTurn2Same = await generateNotehookResponse(
      'Can you clarify [@Auth Service.2]?',
      [],
      dummySettings,
      undefined,
      [],
      [entity, turn1Message],
      []
    );
    assert.equal(resultTurn2Same.injectedContext, undefined, 'Unchanged entity version 2 must be deduplicated');

    // Turn 2 Case B: User asks about canonical [@Auth Service] or [@Auth Service.1]. Must be injected!
    const resultTurn2V1 = await generateNotehookResponse(
      'Compare with [@Auth Service.1]',
      [],
      dummySettings,
      undefined,
      [],
      [entity, turn1Message],
      []
    );
    assert.ok(resultTurn2V1.injectedContext, 'Different version (v1) must be injected into context');
    assert.match(resultTurn2V1.injectedContext, /\[Version 1 "v1"\]: Version 1 body/);
  });

  it('15. Exposes expand_knowledge_page function tooling schemas for Gemini and OpenAI', () => {
    // Gemini tool declaration
    const geminiDeclaration = KNOWLEDGE_EXPANSION_TOOL_GEMINI.functionDeclarations[0];
    assert.equal(geminiDeclaration.name, 'expand_knowledge_page');
    assert.ok(geminiDeclaration.description.includes('Expand an unmentioned recent knowledge page'));
    assert.deepEqual(geminiDeclaration.parameters.required, ['page_id_or_title']);

    // OpenAI tool declaration
    const openAiDeclaration = KNOWLEDGE_EXPANSION_TOOL_OPENAI[0].function;
    assert.equal(openAiDeclaration.name, 'expand_knowledge_page');
    assert.ok(openAiDeclaration.description.includes('Expand an unmentioned recent knowledge page'));
    assert.deepEqual(openAiDeclaration.parameters.required, ['page_id_or_title']);
  });

  it('16. Expands unmentioned entity files with base body and canonical/active version', () => {
    const versionedEntity: Page = {
      id: 'entity-billing',
      short_id: 'e42',
      type: 'entity',
      title: 'Billing Microservice',
      content: 'Primary billing microservice handling subscription lifecycle.',
      canonical_version_id: 'ver-canonical-2',
      versions: [
        {
          id: 'ver-1',
          entity_id: 'entity-billing',
          version_num: 1,
          title: 'Legacy Invoicing',
          content: 'Cron-based invoicing engine running on worker tier.',
          created_at: '2026-09-01T00:00:00.000Z',
          is_canonical: false,
        },
        {
          id: 'ver-canonical-2',
          entity_id: 'entity-billing',
          version_num: 2,
          title: 'Event-driven Billing v2',
          content: 'Kafka streaming billing engine with automated webhook reconciliation.',
          created_at: '2026-09-15T00:00:00.000Z',
          is_canonical: true,
        },
      ],
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-15T00:00:00.000Z',
    };

    const workspacePages = [versionedEntity, ...samplePages];

    // Expansion via short ID "e42"
    const byShortId = expandKnowledgePage('e42', workspacePages);
    assert.ok(byShortId.page, 'Must find page by short ID');
    assert.equal(byShortId.page?.id, 'entity-billing');
    assert.match(byShortId.expandedText, /--- EXPANDED KNOWLEDGE PAGE: \[@Billing Microservice\] \(ID: e42\) \[type: entity\] ---/);
    assert.match(byShortId.expandedText, /Primary billing microservice handling subscription lifecycle\./, 'Must include base body');
    assert.match(
      byShortId.expandedText,
      /Active\/(?:Canonical|Primary) Version \["Event-driven Billing v2"\]: Kafka streaming billing engine with automated webhook reconciliation\./,
      'Must include canonical version'
    );

    // Expansion via title "Billing Microservice"
    const byTitle = expandKnowledgePage('Billing Microservice', workspacePages);
    assert.ok(byTitle.page);
    assert.equal(byTitle.page?.id, 'entity-billing');
    assert.match(byTitle.expandedText, /Primary billing microservice handling subscription lifecycle\./);
    assert.match(byTitle.expandedText, /Active\/(?:Canonical|Primary) Version \["Event-driven Billing v2"\]/);

    // Expansion via tagged syntax "[@Billing Microservice]"
    const byTag = expandKnowledgePage('[@Billing Microservice]', workspacePages);
    assert.ok(byTag.page);
    assert.match(byTag.expandedText, /Primary billing microservice/);
    assert.match(byTag.expandedText, /Event-driven Billing v2/);
  });

  it('17. Expands unmentioned entity files with specific requested versions (e.g. e42.1)', () => {
    const versionedEntity: Page = {
      id: 'entity-billing',
      short_id: 'e42',
      type: 'entity',
      title: 'Billing Microservice',
      content: 'Primary billing microservice handling subscription lifecycle.',
      canonical_version_id: 'ver-canonical-2',
      versions: [
        {
          id: 'ver-1',
          entity_id: 'entity-billing',
          version_num: 1,
          title: 'Legacy Invoicing',
          content: 'Cron-based invoicing engine running on worker tier.',
          created_at: '2026-09-01T00:00:00.000Z',
          is_canonical: false,
        },
        {
          id: 'ver-canonical-2',
          entity_id: 'entity-billing',
          version_num: 2,
          title: 'Event-driven Billing v2',
          content: 'Kafka streaming billing engine with automated webhook reconciliation.',
          created_at: '2026-09-15T00:00:00.000Z',
          is_canonical: true,
        },
      ],
      created_at: '2026-09-01T00:00:00.000Z',
    };

    const workspacePages = [versionedEntity, ...samplePages];

    // Expansion for specific version e42.1
    const byVersionShortId = expandKnowledgePage('e42.1', workspacePages);
    assert.ok(byVersionShortId.page);
    assert.match(byVersionShortId.expandedText, /\[@Billing Microservice\.1\]/);
    assert.match(byVersionShortId.expandedText, /Primary billing microservice/);
    assert.match(byVersionShortId.expandedText, /Version 1 \["Legacy Invoicing"\]: Cron-based invoicing engine/);
    assert.doesNotMatch(byVersionShortId.expandedText, /Kafka streaming billing engine/);
  });

  it('18. Handles expansion of unmentioned decisions, notes, and non-existent pages gracefully', () => {
    // Decision expansion
    const decisionExpansion = expandKnowledgePage('d1', samplePages);
    assert.ok(decisionExpansion.page);
    assert.match(decisionExpansion.expandedText, /--- EXPANDED KNOWLEDGE PAGE: \[@Cap Pool Size at 20\] \(ID: d1\) \[type: decision\] ---/);
    assert.match(decisionExpansion.expandedText, /Connection pool is capped at 20 to avoid exhaustion\./);

    // Note expansion
    const noteExpansion = expandKnowledgePage('Sprint Notes', samplePages);
    assert.ok(noteExpansion.page);
    assert.match(noteExpansion.expandedText, /--- EXPANDED KNOWLEDGE PAGE: \[@Sprint Notes\] \(ID: n1\) \[type: note\] ---/);
    assert.match(noteExpansion.expandedText, /Discussion notes for Q3 sprint planning\./);

    // Non-existent page
    const missing = expandKnowledgePage('non-existent-page', samplePages);
    assert.equal(missing.page, null);
    assert.match(missing.expandedText, /Knowledge page "non-existent-page" was not found in the workspace catalogue\./);
  });

  it('19. Removing/deleting an entity or knowledge page removes it completely from Catalogue, Pinned Anchors, and dynamic context', async () => {
    // Start with workspace containing Auth Service (page-auth) pinned
    const pinnedIds = ['page-auth'];
    const catalogueBefore = buildKnowledgeCatalogueSection(samplePages);
    const pinnedBefore = buildPinnedKnowledgeSection(samplePages, pinnedIds);

    assert.match(catalogueBefore, /\[@Auth Service\]/);
    assert.match(pinnedBefore, /### PINNED ENTITY: \[@Auth Service\]/);

    // User deletes page-auth from workspace pages and pinned set
    const remainingPages = samplePages.filter((p) => p.id !== 'page-auth');
    const remainingPinned = pinnedIds.filter((pid) => pid !== 'page-auth');

    // 1. Catalogue must not contain Auth Service
    const catalogueAfter = buildKnowledgeCatalogueSection(remainingPages);
    assert.doesNotMatch(catalogueAfter, /\[@Auth Service\]/);

    // 2. Pinned section must be empty
    const pinnedAfter = buildPinnedKnowledgeSection(remainingPages, remainingPinned);
    assert.equal(pinnedAfter, '');

    // 3. expandKnowledgePage must fail cleanly
    const expansionResult = expandKnowledgePage('e1', remainingPages);
    assert.equal(expansionResult.page, null);
    assert.match(expansionResult.expandedText, /was not found in the workspace catalogue/);

    // 4. Referencing deleted entity in prompt must not inject it into context
    const turnResult = await generateNotehookResponse(
      'Can you explain [@Auth Service]?',
      [],
      dummySettings,
      undefined,
      [],
      remainingPages,
      remainingPinned
    );
    assert.equal(turnResult.injectedContext, undefined, 'Deleted entity must never be injected into Tier 4 context');
  });

  it('20. Deleting a message page removes it from conversation history and LLM context', async () => {
    const msg1: Page = {
      id: 'msg-confidential-1',
      short_id: 'm88',
      type: 'message',
      role: 'assistant',
      title: 'Confidential Key',
      user_prompt: 'Confidential message: API key is sk-secret-12345',
      content: 'I have received the secret API key.',
      created_at: '2026-09-24T10:00:00.000Z',
    };

    const msg2: Page = {
      id: 'msg-standard-2',
      short_id: 'm89',
      type: 'message',
      role: 'assistant',
      title: 'Server Topic',
      user_prompt: 'What is the server architecture?',
      content: 'The server uses Node.js and Next.js.',
      created_at: '2026-09-24T10:05:00.000Z',
    };

    const cleanKnowledgePages = samplePages.filter((p) => p.type !== 'message');

    // Before deletion: msg1 is in workspace
    const allBefore = [msg1, msg2, ...cleanKnowledgePages];
    const turnBefore = await generateNotehookResponse(
      'What did we discuss earlier?',
      [],
      dummySettings,
      undefined,
      [],
      allBefore,
      []
    );
    assert.ok(turnBefore);

    // User deletes msg1 (e.g. to sanitize confidential key and reset context)
    const allAfter = [msg2, ...cleanKnowledgePages]; // msg1 removed

    // Verify m88 cannot be expanded or looked up
    const expandDeletedMsg = expandKnowledgePage('m88', allAfter);
    assert.equal(expandDeletedMsg.page, null);

    // Verify requesting turn against updated pages
    const turnAfter = await generateNotehookResponse(
      'Can you read [@m88]?',
      [],
      dummySettings,
      undefined,
      [],
      allAfter,
      []
    );
    assert.equal(
      turnAfter.injectedContext,
      undefined,
      'Deleted message m88 must not be injected or present in context'
    );
  });

  it('21. Deduplicates multiple references to the same todo or message within a single prompt', () => {
    const todoPage: Page = {
      id: 'todo-setup',
      short_id: 't5',
      type: 'todo',
      title: 'Set up logging pipeline',
      content: 'Set up logging pipeline with OpenTelemetry.',
      done: false,
      created_at: '2026-09-24T10:00:00.000Z',
    };

    const msgPage: Page = {
      id: 'msg-arch',
      short_id: 'm10',
      type: 'message',
      role: 'assistant',
      title: 'Architecture Overview',
      user_prompt: 'Explain the architecture',
      content: 'Here is the architecture details.',
      created_at: '2026-09-24T09:00:00.000Z',
    };

    const pages = [todoPage, msgPage];

    // Single prompt referencing the same todo 3 different ways: by short ID, by full typed tag, and duplicate short ID
    const promptTodo = 'Please check [@t5] and also verify [@todo: Set up logging pipeline] and re-read [@t5].';
    const refsTodo = getReferencedPagesFromPrompt(promptTodo, pages);
    assert.equal(refsTodo.length, 1, 'Multiple mentions of same todo in single prompt must resolve to 1 reference');
    assert.equal(refsTodo[0].id, 'todo-setup');

    // Single prompt referencing the same message multiple ways
    const promptMsg = 'Compare [@m10] with [@Architecture Overview] and [@m10] again.';
    const refsMsg = getReferencedPagesFromPrompt(promptMsg, pages);
    assert.equal(refsMsg.length, 1, 'Multiple mentions of same message in single prompt must resolve to 1 reference');
    assert.equal(refsMsg[0].id, 'msg-arch');
  });

  it('22. Deduplicates out-of-buffer message pages and todos across consecutive turns once injected', async () => {
    const turnTime1 = '2026-09-24T10:00:00.000Z';
    const turnTime2 = '2026-09-24T10:05:00.000Z';

    // Old message outside active history buffer
    const oldMsg: Page = {
      id: 'old-msg-turn',
      short_id: 'm99',
      type: 'message',
      role: 'assistant',
      title: 'Old Schema Decision',
      user_prompt: 'What was the old schema?',
      content: 'The old schema used raw integers for IDs.',
      created_at: '2026-09-20T00:00:00.000Z',
    };

    // Todo created in Turn 1
    const todoItem: Page = {
      id: 'todo-migrate',
      short_id: 't20',
      type: 'todo',
      title: 'Migrate integer IDs to UUIDs',
      content: 'Migrate integer IDs to UUIDs',
      done: false,
      created_at: turnTime1,
      updated_at: turnTime1,
    };

    // Turn 1 message that injected oldMsg into its context and generated todoItem
    const turn1Message: Page = {
      id: 'turn-msg-1',
      short_id: 'm100',
      type: 'message',
      role: 'assistant',
      title: 'Schema Migration Turn',
      user_prompt: 'Review [@m99] and create task',
      content: 'We reviewed the old schema and tracked: [@todo: Migrate integer IDs to UUIDs]',
      injected_context: `=== REFERENCED CONTEXT FOR THIS TURN ===\n--- REFERENCED PAGE: [@Old Schema Decision] (ID: m99) [type: message] ---\nContent:\nThe old schema used raw integers for IDs.\n--- END REFERENCED PAGE ---\n=== END REFERENCED CONTEXT ===`,
      referenced_page_ids: ['old-msg-turn', 'todo-migrate'],
      created_at: turnTime1,
    };

    const allPages = [oldMsg, todoItem, turn1Message];

    // In Turn 2, user asks again about both [@m99] and [@t20]
    // Since both were already injected/present in Turn 1 and unchanged, they MUST be deduplicated
    const turn2Result = await generateNotehookResponse(
      'What is the next step for [@m99] and [@t20]?',
      [],
      dummySettings,
      undefined,
      [],
      allPages,
      []
    );

    assert.equal(
      turn2Result.injectedContext,
      undefined,
      'Unchanged old message m99 and unchanged todo t20 must be deduplicated in Turn 2'
    );

    // If todo is now marked done in Turn 3 (updated_at after turn 1)
    const updatedTodo: Page = {
      ...todoItem,
      done: true,
      updated_at: turnTime2,
    };

    const turn3Result = await generateNotehookResponse(
      'Check status of [@t20]',
      [],
      dummySettings,
      undefined,
      [],
      [oldMsg, updatedTodo, turn1Message],
      []
    );

    assert.ok(turn3Result.injectedContext, 'Modified todo must be re-injected with updated status');
    assert.match(turn3Result.injectedContext, /\[Status: COMPLETED \/ DONE\]/);
  });
});




