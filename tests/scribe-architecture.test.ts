import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeCatalogueSection,
  buildPinnedKnowledgeSection,
  buildDynamicReferencedSection,
  generateScribeResponse,
  getReferencedPagesFromPrompt,
} from '../lib/ai-scribe';
import { Page, AISettings } from '../lib/types';

describe('AI Scribe Architecture & Prefix Caching Tests', () => {
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
    const turn2Result = await generateScribeResponse(
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

    const turn2Result = await generateScribeResponse(
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

    const turn2Result = await generateScribeResponse(
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
    const result = await generateScribeResponse(
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
});
