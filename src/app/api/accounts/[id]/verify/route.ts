import { verifySocialAccountConnection, SocialAccountNotFoundError } from '@/lib/social/account-health'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!id) {
    return Response.json({ success: false, error: 'Account id is required' }, { status: 400 })
  }

  try {
    const result = await verifySocialAccountConnection(id)
    return Response.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof SocialAccountNotFoundError) {
      return Response.json({ success: false, error: error.message }, { status: 404 })
    }

    const message = error instanceof Error ? error.message : 'Connection verification failed'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
