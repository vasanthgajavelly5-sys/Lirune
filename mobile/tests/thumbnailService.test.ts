/**
 * Lirune Mobile - Cover Thumbnail Utility Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getThumbnailPath,
  getListCoverUri,
  THUMBNAIL_WIDTH,
} from '../utils/thumbnailUtils.ts';

describe('Thumbnail Utilities', () => {
  it('THUMBNAIL_WIDTH is ~400px (standard grid card resolution)', () => {
    assert.equal(THUMBNAIL_WIDTH, 400);
  });

  describe('getThumbnailPath', () => {
    it('returns empty string for empty, undefined, or whitespace-only inputs', () => {
      assert.equal(getThumbnailPath(), '');
      assert.equal(getThumbnailPath(''), '');
      assert.equal(getThumbnailPath('   '), '');
    });

    it('replaces file extensions with _thumb.jpg', () => {
      assert.equal(
        getThumbnailPath('/data/user/0/covers/book1.jpg'),
        '/data/user/0/covers/book1_thumb.jpg'
      );
      assert.equal(
        getThumbnailPath('/data/user/0/covers/book1.png'),
        '/data/user/0/covers/book1_thumb.jpg'
      );
      assert.equal(
        getThumbnailPath('/data/user/0/covers/cover.jpeg'),
        '/data/user/0/covers/cover_thumb.jpg'
      );
      assert.equal(
        getThumbnailPath('/data/user/0/covers/cover.webp'),
        '/data/user/0/covers/cover_thumb.jpg'
      );
    });

    it('appends _thumb.jpg if there is no file extension', () => {
      assert.equal(
        getThumbnailPath('/data/user/0/covers/raw_cover'),
        '/data/user/0/covers/raw_cover_thumb.jpg'
      );
    });

    it('does not double append if path already has _thumb.', () => {
      assert.equal(
        getThumbnailPath('/data/user/0/covers/book1_thumb.jpg'),
        '/data/user/0/covers/book1_thumb.jpg'
      );
    });
  });

  describe('getListCoverUri', () => {
    it('returns undefined when neither thumbnailUrl nor coverUrl is set', () => {
      assert.equal(
        getListCoverUri({ coverUrl: undefined, thumbnailUrl: undefined }),
        undefined
      );
    });

    it('prefers thumbnailUrl over coverUrl when present', () => {
      const uri = getListCoverUri({
        coverUrl: '/data/user/0/covers/original.jpg',
        thumbnailUrl: '/data/user/0/covers/custom_thumb.jpg',
      });
      assert.equal(uri, 'file:///data/user/0/covers/custom_thumb.jpg');
    });

    it('derives thumbnail path from coverUrl when thumbnailUrl is missing', () => {
      const uri = getListCoverUri({
        coverUrl: '/data/user/0/covers/mybook.png',
        thumbnailUrl: undefined,
      });
      assert.equal(uri, 'file:///data/user/0/covers/mybook_thumb.jpg');
    });

    it('preserves existing uri schemes (file://, http://, https://, data:)', () => {
      assert.equal(
        getListCoverUri({
          coverUrl: undefined,
          thumbnailUrl: 'file:///data/thumb.jpg',
        }),
        'file:///data/thumb.jpg'
      );

      assert.equal(
        getListCoverUri({
          coverUrl: undefined,
          thumbnailUrl: 'https://example.com/cover.jpg',
        }),
        'https://example.com/cover.jpg'
      );

      assert.equal(
        getListCoverUri({
          coverUrl: undefined,
          thumbnailUrl: 'data:image/jpeg;base64,...',
        }),
        'data:image/jpeg;base64,...'
      );
    });
  });
});
