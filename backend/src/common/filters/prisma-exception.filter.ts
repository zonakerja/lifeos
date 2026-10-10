import { ArgumentsHost, Catch, HttpStatus } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Prisma } from "../../generated/prisma/client";
import { Response } from "express";

const STATUS_BY_CODE: Record<string, { status: number; message: string }> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    message: "Data dengan nilai unik tersebut sudah ada.",
  },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: "Relasi data tidak valid.",
  },
  P2025: { status: HttpStatus.NOT_FOUND, message: "Data tidak ditemukan." },
};

/** Memetakan error Prisma yang umum menjadi respons HTTP yang bermakna (bukan 500). */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = STATUS_BY_CODE[exception.code];
    if (!mapped) return super.catch(exception, host);

    const response = host.switchToHttp().getResponse<Response>();
    response.status(mapped.status).json({
      statusCode: mapped.status,
      message: mapped.message,
      code: exception.code,
    });
  }
}
