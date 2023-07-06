import { INestApplication, Logger } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { OpenAPIObject } from '@nestjs/swagger'
import { Request, Response } from 'express'
import expressAuth from 'express-basic-auth'
import * as handlebars from 'express-handlebars'
import pathModule from 'path'
import { resolve } from 'url'
import { LogoOptions, RedocDocument, RedocOptions } from './interfaces'
import { schema } from './model'

const logger = new Logger('RedocModule')

export class RedocModule {
	/**
	 * Setup ReDoc frontend
	 * @param path - path to mount the ReDoc frontend
	 * @param app - NestApplication
	 * @param document - Swagger document object
	 * @param options - Init options
	 * @param debug - Debug mode
	 */
	public static async setup(
		path: string,
		app: INestApplication,
		document: OpenAPIObject,
		options: RedocOptions,
		debug?: boolean,
	): Promise<void> {
		// Validate options object
		try {
			if (debug) {
				logger.verbose('Debug mode is enabled')
			}
			const _options = await this.validateOptionsObject(options, document, debug)
			const redocDocument = this.addVendorExtensions(_options, <RedocDocument>document)
			console.log(options)
			console.log(_options)
			return await this.setupExpress(path, <NestExpressApplication>app, redocDocument, _options)
		} catch (error) {
			if (debug) {
				console.table(options)
				console.dir(document)
				logger.error(error)
			}
			console.log(error)
			throw error
		}
	}

	private static async validateOptionsObject(
		options: RedocOptions,
		document: OpenAPIObject,
		debug?: boolean,
	): Promise<RedocOptions> {
		try {
			return schema(document).validateAsync(options) as RedocOptions
		} catch (error) {
			// Something went wrong while parsing config object
			if (debug) {
				console.table(options)
				console.dir(document)
				console.error(error)
			}
			throw new TypeError(error.message)
		}
	}

	/**
	 * Setup ReDoc frontend for express plattform
	 * @param path - path to mount the ReDoc frontend
	 * @param app - NestApplication
	 * @param document - ReDoc document object
	 * @param options - Init options
	 */
	private static async setupExpress(
		path: string,
		app: NestExpressApplication,
		document: RedocDocument,
		options: RedocOptions,
	) {
		console.log('setupExpress')
		const httpAdapter = app.getHttpAdapter()
		console.log(httpAdapter);
		// Normalize URL path to use
		const finalPath = this.normalizePath(path)
		console.log('finalPath -> ', finalPath)
		// Add a slash to the end of the URL path to use in URL resolve function
		const resolvedPath = finalPath.slice(-1) !== '/' ? finalPath + '/' : finalPath
		console.log('resolvedPath -> ', resolvedPath)

		// Serve swagger spec in another URL appended to the normalized path
		const docUrl = resolve(resolvedPath, `${options.docName}.json`)
		console.log('docUrl -> ', docUrl)

		// create helper to convert metadata to JSON
		const hbs = handlebars.create({
			helpers: {
				toJSON: function (object: any) {
					return JSON.stringify(object)
				},
			},
		})
		console.log('hbs')
		console.log(hbs)
		// spread redoc options
		const { title, favicon, theme, redocVersion, ...otherOptions } = options
		// create render object
		const renderData = {
			data: {
				title,
				docUrl,
				favicon,
				redocVersion,
				options: otherOptions,
				...(theme && {
					theme: {
						...theme,
					},
				}),
			},
		}
		// console.log('########## renderData #########')
		// console.log(renderData)
		// this is our handlebars file path
		const redocFilePath = pathModule.join(__dirname, '..', 'views', 'redoc.handlebars')
		console.log('########## redocFilePath #########')
		console.log(redocFilePath)

		// get handlebars rendered HTML
		const redocHTML = await hbs.render(redocFilePath, renderData)
		console.log('########## redocHTML #########')
		console.log(redocHTML)

		console.log('########## finalPath #########')
		console.log(finalPath)
		console.log('next step serve redoc frontend');
		// Serve ReDoc Frontend
		httpAdapter.get(finalPath, async (req: Request, res: Response) => {
			console.log('serving redoc frontend')
			const sendPage = () => {
				// Content-Security-Policy: worker-src 'self' blob:
				res.setHeader(
					'Content-Security-Policy',
					"default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; child-src * 'unsafe-inline' 'unsafe-eval' blob:; worker-src * 'unsafe-inline' 'unsafe-eval' blob:; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';",
				)
				console.log('res')
				console.log(res)
				// whoosh
				res.send(redocHTML)
			}
			if (options.auth?.enabled) {
				const { user, password } = options.auth
				expressAuth({ users: { [user]: password }, challenge: true })(req, res, () => {
					sendPage()
				})
			} else {
				sendPage()
			}
		})
		console.log(' next -> Serve swagger spec json');
		// Serve swagger spec json
		httpAdapter.get(docUrl, (req: Request, res: Response) => {
			console.log('Serve swagger');
			res.setHeader('Content-Type', 'application/json')
			res.send(document)
		})
	}

	/**
	 * Normalize path string
	 * @param path - Path string
	 */
	private static normalizePath(path: string): string {
		return path.charAt(0) !== '/' ? '/' + path : path
	}

	/**
	 * Add any vendor options if they are present in the options object
	 * @param options options object
	 * @param document redoc document
	 */
	private static addVendorExtensions(options: RedocOptions, document: RedocDocument): RedocDocument {
		if (options.logo) {
			const logoOption: Partial<LogoOptions> = { ...options.logo }
			document.info['x-logo'] = logoOption
		}

		if (options.tagGroups) {
			document['x-tagGroups'] = options.tagGroups
		}

		return document
	}
}
