package com.code2knowledge.common.handler;

import com.code2knowledge.common.exception.ApiException;
import com.code2knowledge.common.response.ErrorVO;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;

/** HTTP异常翻译入口；不暴露持久化异常细节，未知失败仍返回通用错误。 */
@RestControllerAdvice
public class ApiExceptionHandler {
    /**
     * 翻译已确认的业务失败，不改变事务回滚行为。
     *
     * @param error 服务抛出的受控失败，不为空
     *
     * @return 状态与稳定错误对象，不为空
     */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorVO> handle(ApiException error) { return ResponseEntity.status(error.getStatus()).body(new ErrorVO(error.getCode(), error.getMessage())); }
    /**
     * 将数据库唯一冲突收敛为409，不回显数据库或冲突值。
     *
     * @param error 唯一约束冲突，不为空
     *
     * @return 通用冲突响应，不为空
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorVO> conflict(DataIntegrityViolationException error) { return ResponseEntity.status(409).body(new ErrorVO("CONFLICT", "名称或登录名已存在")); }
    /**
     * 无效JSON和缺字段不进入业务，避免默认HTML错误响应。
     *
     * @param error Spring解析失败，不为空
     *
     * @return 固定400响应，不为空
     */
    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class})
    public ResponseEntity<ErrorVO> invalid(Exception error) { return ResponseEntity.badRequest().body(new ErrorVO("INVALID_REQUEST", "请求格式不正确")); }
    /**
     * 将未预期失败转换为安全错误；不向浏览器返回异常文本。
     *
     * @param error 未预期错误，不为空
     *
     * @return 通用500响应，不为空
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorVO> unexpected(Exception error) { return ResponseEntity.internalServerError().body(new ErrorVO("INTERNAL_ERROR", "服务暂时不可用，请稍后重试")); }
}
