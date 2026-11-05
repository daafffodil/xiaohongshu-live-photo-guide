// Extracted unchanged from the user-confirmed published 1.0.7 ZIP.
let publishMediaField = 'live_photo_sources';
let publishPageType = 'slides_edit';
function openPreparedPublisher(sdk, media) {
  const note = window.ShamCaptions.note(state);
  if (!media || typeof media.url !== 'string' || !media.url || typeof media.video_url !== 'string' || !media.video_url) throw new Error('发布素材路径无效，请重新生成');
  const alternate = publishMediaField === 'live_photo_resources' ? 'live_photo_sources' : 'live_photo_resources';
  const otherPage = publishPageType === 'slides_edit' ? 'photo_publish' : 'slides_edit';
  const routes = [[publishPageType, publishMediaField], [publishPageType, alternate], [otherPage, publishMediaField], [otherPage, alternate]];
  function attempt(index) {
    const pageType = routes[index][0], field = routes[index][1];
    const resources = {}; resources[field] = [{ url: media.url, video_url: media.video_url }];
    // The injected SDK serializes mediaInfo. Do not double-serialize it.
    function rejected(error) {
      const message = String(error && (error.errMsg || error.message) || '');
      const rejectedMedia = /media[_\s]?info/i.test(message) || /slides[\s_]+resources?[\s_]+too[\s_]+few/i.test(message);
      console.warn('live图参数检查', pageType, field, error && error.errCode, message);
      // Only local validation failures permit another route. Never retry cancellation,
      // a pending editor, network errors, or unknown failures. Never add static media.
      if (index + 1 >= routes.length || Number(error && error.errCode) !== 10001 || !/invalid\s*param/i.test(message) || !rejectedMedia) throw error;
      return attempt(index + 1);
    }
    let result;
    try { result = sdk.postNote({title: note.title, content: note.body, tags: note.tags.join(','), pageType, mediaInfo: resources}); }
    catch (error) { return rejected(error); }
    return Promise.resolve(result).then(value => { publishMediaField = field; publishPageType = pageType; return value; }, rejected);
  }
  return attempt(0);
}

