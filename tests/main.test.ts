import { describe, it, expect, vi } from 'vitest'
import { setFailed } from '@actions/core'
// @ts-expect-error mock feature
import { send } from 'resend'
// @ts-expect-error mock feature
import { addLabels, createComment, get } from '@octokit/rest'

import { run, expense } from '../src/main.js'
import { PULLS } from './__fixtures__/gh.js' assert { type: 'json' }

vi.mock('@actions/core', () => ({
    setFailed: vi.fn(),
    getInput: vi.fn(input => {
        if (input === 'prNumber') return '12121'
        if (input === 'amount') return '123'
    })
}))

vi.mock('resend', () => {
    const send = vi.fn(() => ({ error: null }))
    return {
        send,
        Resend: class {
            emails = { send }
        }
    }
})

vi.mock('@octokit/rest', async () => {
    const { COMMITS, PULLS } = await import('./__fixtures__/gh.js', {
        assert: { type: 'json' }
    })
    const listCommits = vi.fn().mockReturnValue({ data: COMMITS })
    const get = vi.fn().mockReturnValue({ data: PULLS })
    const createComment = vi.fn()
    const addLabels = vi.fn()
    return {
        listCommits,
        createComment,
        get,
        addLabels,
        Octokit: class {
            pulls = { listCommits, get }
            issues = { createComment, addLabels }
        }
    }
})

vi.mock('../src/mail.tsx', () => ({ default: vi.fn() }))

describe('run', () => {
    it('calls expense and fails the pipeline', async () => {
        await run()
        expect(setFailed).toHaveBeenCalledWith(
            expect.stringContaining('Please export')
        )
    })
})

describe('expense', () => {
    it('should throw if environment variables are not set', async () => {
        await expect(() => expense()).rejects.toThrow(
            'Please export a "GH_TOKEN"'
        )
        await expect(() =>
            expense({
                githubToken: 'token'
            } as any)
        ).rejects.toThrow('Please export a "RESEND_API_KEY"')
        await expect(() =>
            expense({
                githubToken: 'token',
                resendAPIKey: 'token'
            } as any)
        ).rejects.toThrow('Could not get repository information')
    })

    it('should properly expense a PR', async () => {
        await expense({
            githubToken: 'token',
            resendAPIKey: 'token',
            actionRepo: 'webdriverio/webdriverio'
        })
        expect(send).toMatchInlineSnapshot(`
          [MockFunction spy] {
            "calls": [
              [
                {
                  "bcc": "expense@webdriver.io",
                  "from": "WebdriverIO Team <sponsor@webdriver.io>",
                  "react": undefined,
                  "subject": "Thank you for contributing to WebdriverIO!",
                  "text": "Thank you for contributing to WebdriverIO!",
                  "to": "foo@bar.com",
                },
              ],
            ],
            "results": [
              {
                "type": "return",
                "value": {
                  "error": null,
                },
              },
            ],
          }
        `)
        expect(createComment).toMatchInlineSnapshot(`
          [MockFunction spy] {
            "calls": [
              [
                {
                  "body": "Hey __dependabot[bot]__ 👋

          Thank you for your contribution to WebdriverIO! Your pull request has been marked as an "Expensable" contribution. We've sent you an email with further instructions on how to claim your expenses from our development fund. Please make sure to check your spam folder as well. If you have any questions, feel free to reach out to us at __expense@webdriver.io__ or in the contributing channel on [Discord](https://discord.webdriver.io).

          We are looking forward to more contributions from you in the future 🙌

          Have a nice day,
          The WebdriverIO Team 🤖",
                  "issue_number": 12121,
                  "owner": "webdriverio",
                  "repo": "webdriverio",
                },
              ],
            ],
            "results": [
              {
                "type": "return",
                "value": undefined,
              },
            ],
          }
        `)
        expect(addLabels).toMatchInlineSnapshot(`
          [MockFunction spy] {
            "calls": [
              [
                {
                  "issue_number": 12121,
                  "labels": [
                    "Expensable $123 💸",
                  ],
                  "owner": "webdriverio",
                  "repo": "webdriverio",
                },
              ],
            ],
            "results": [
              {
                "type": "return",
                "value": undefined,
              },
            ],
          }
        `)
    })

    it('fails if PR has already been expensed', async () => {
        const pulls = Object.create({
            data: { ...PULLS, merge_commit_sha: undefined }
        })
        vi.mocked(get).mockResolvedValue(pulls)
        await expect(() =>
            expense({
                githubToken: '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',
                resendAPIKey: 'token',
                actionRepo: 'webdriverio/webdriverio'
            })
        ).rejects.toThrow('Pull request has not been merged yet!')
    })

    it('fails if PR has already been expensed', async () => {
        const pulls = Object.create({
            data: { ...PULLS, labels: [{ name: 'Expensable $123 💸' }] }
        })
        vi.mocked(get).mockResolvedValue(pulls)
        await expect(() =>
            expense({
                githubToken: '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',
                resendAPIKey: 'token',
                actionRepo: 'webdriverio/webdriverio'
            })
        ).rejects.toThrow('Pull request has already been expensed!')
    })
})
