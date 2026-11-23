package com.code2knowledge.task.mapper;

import com.code2knowledge.task.domain.entity.TaskDO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 来源预检持久化接口；服务事务先锁企业后锁账户/设备，SQL状态条件提供第二层保护；无软删除、消息或对象上传。 */
@Mapper
public interface TaskMapper {
    /**
     * @param tenantId 当前身份解析的企业UUID
     * @param ownerId 任务创建成员UUID，不允许管理员跨所有者读取
     * @param id 已在服务校验归属的任务或尝试UUID，由方法职责区分
     * @return 指定私有任务，不可见返回null */
    TaskDO find(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("id") String id);
    /**
     * @param tenantId 当前身份解析的企业UUID
     * @param ownerId 任务创建成员UUID，不允许管理员跨所有者读取
     * @param requestId 当前所有者创建幂等UUID
     * @return 创建幂等键对应任务，不存在为null */
    TaskDO request(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("requestId") String requestId);
    /**
     * @param tenantId 当前身份解析的企业UUID
     * @param ownerId 任务创建成员UUID，不允许管理员跨所有者读取
     * @param offset 分页起始偏移，条目数，非负
     * @return 当前成员分页，每页20项 */
    List<TaskDO> list(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("offset") int offset);
    /**
     * @param tenantId 当前身份解析的企业UUID
     * @param ownerId 任务创建成员UUID，不允许管理员跨所有者读取
     * @return 仅当前成员任务总量 */
    int count(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId);
    /**
     * @param tenantId 当前身份解析的企业UUID
     * @param ownerId 任务创建成员UUID，不允许管理员跨所有者读取
     * @param deviceId 当前所有者私有设备UUID
     * @return 该私有设备待领或运行任务，最多100项 */
    List<TaskDO> pending(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("deviceId") String deviceId);
    /**
     * @param tenantId 当前企业
     * @param ownerId 本人成员
     * @param offset 非负分页偏移
     * @return 仅本人逆向任务20条 */
    List<TaskDO> listAnalysis(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("offset") int offset);
    /**
     * @param tenantId 当前企业
     * @param ownerId 本人成员
     * @return 本人逆向任务总量 */
    int countAnalysis(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId);
    /**
     * @param tenantId 当前企业
     * @param ownerId 本人成员
     * @param deviceId 私有设备
     * @return 仅逆向的待领尝试，容量与预检共用 */
    List<TaskDO> pendingAnalysis(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("deviceId") String deviceId);
    /**
     * @param tenantId 当前身份解析的企业UUID
     * @param deviceId 当前所有者私有设备UUID
     * @return 设备有效运行尝试数量，容量固定1 */
    int active(@Param("tenantId") String tenantId, @Param("deviceId") String deviceId);
    /** @param task 已校验任务事实 插入已校验的私有任务*/
    void insert(@Param("task") TaskDO task);
    /**
     * @param id 已在服务校验归属的任务或尝试UUID，由方法职责区分
     * @param taskId 已校验的所属任务UUID
     * @param number 新尝试序号，从1开始且不复用 插入明确序号的排队尝试*/
    void attempt(@Param("id") String id, @Param("taskId") String taskId, @Param("number") int number);
    /**
     * @param id 已在服务校验归属的任务或尝试UUID，由方法职责区分
     * @param leaseId 本次随机租约UUID，仅设备协议返回
     * @return 领取排队尝试，45秒租期 */
    int lease(@Param("id") String id, @Param("leaseId") String leaseId);
    /**
     * @param id 已在服务校验归属的任务或尝试UUID，由方法职责区分
     * @return 延长尚有效的运行租约至当前45秒 */
    int renew(@Param("id") String id);
    /**
     * @param id 已在服务校验归属的任务或尝试UUID，由方法职责区分
     * @param state 服务端固定终态，不接受任意状态输入
     * @param message 固定安全状态说明，不含原始设备日志
     * @param commitId 固定Git完整commit；非成功为空字符串
     * @param archiveSha256 隔离归档SHA256；非成功为空字符串
     * @param fileCount 提交树条目数，非成功为0
     * @param archiveBytes 隔离归档字节数，非成功为0
     * @return 条件结束当前排队或运行尝试，结果不可覆盖 */
    int finish(@Param("id") String id, @Param("state") String state, @Param("message") String message, @Param("commitId") String commitId, @Param("archiveSha256") String archiveSha256, @Param("fileCount") int fileCount, @Param("archiveBytes") long archiveBytes);
    /**
     * @param tenantId 当前身份解析的企业UUID
     * @param ownerId 任务创建成员UUID，不允许管理员跨所有者读取
     * @return 按数据库时钟使当前所有者过期尝试终止 */
    int expire(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId);
    /**
     * @param id 已在服务校验归属的任务或尝试UUID，由方法职责区分
     * @param retry true增加尝试序号，false只增加控制版本 增加任务控制版本，重试时增加尝试序号*/
    void bump(@Param("id") String id, @Param("retry") boolean retry);
    /**
     * @param tenantId 当前身份解析的企业UUID
     * @param ownerId 任务创建成员UUID，不允许管理员跨所有者读取
     * @param id 已在服务校验归属的任务或尝试UUID，由方法职责区分
     * @return 私有任务所有历史尝试，不含其他所有者 */
    List<TaskDO> history(@Param("tenantId") String tenantId, @Param("ownerId") String ownerId, @Param("id") String id);
}
