describe('projectServiceClient.isProjectMember', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  test('looks up UUID identities instead of treating the format as membership', async () => {
    const projectId = '00000000-0000-4000-8000-000000000001';
    const nonMemberId = '00000000-0000-4000-8000-000000000002';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ userId: '00000000-0000-4000-8000-000000000003' }]
    });
    const client = require('./projectServiceClient');

    await expect(client.isProjectMember(projectId, nonMemberId)).resolves.toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('accepts the UUID only when the project service lists it as a member', async () => {
    const projectId = '00000000-0000-4000-8000-000000000004';
    const memberId = '00000000-0000-4000-8000-000000000005';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ userId: memberId, role: 'MEMBER' }]
    });
    const client = require('./projectServiceClient');

    await expect(client.isProjectMember(projectId, memberId)).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
