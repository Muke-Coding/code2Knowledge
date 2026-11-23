package com.code2knowledge.task.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 设备续租/结果输入；不接受文件名、正文、任意日志或宿主路径。 */
@Getter
@Setter
public class TaskReportDTO {
    /** 执行尝试UUID。 */
    private String attemptId;
    /** 领取时租约标识。 */
    private String leaseId;
    /** 领取时尝试序号，不能为空。 */
    private Integer fence;
    /** 续租为空；提交只接受SUCCEEDED或FAILED。 */
    private String outcome;
    /** 成功的40或64位Git commit；失败为空。 */
    private String commitId;
    /** 成功隔离归档SHA256；失败为空。 */
    private String archiveSha256;
    /** 成功提交树条目数，范围0至100000；失败为0。 */
    private Integer fileCount;
    /** 成功归档字节数，不超过256MiB；失败为0。 */
    private Long archiveBytes;
    /** 失败仅允许固定错误码；成功为空，不传错误正文。 */
    private String failureCode;
}
