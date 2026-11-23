package com.code2knowledge.identity.mapper;
import com.code2knowledge.identity.domain.entity.ProfileDO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
/** 本人资料SQL契约；服务持企业写锁并同事务审计，无软删除或异步事件。 */
@Mapper
public interface ProfileMapper {
    /** @param tenant 当前可信企业 @param member 当前可信账户 @return 本人资料；身份不存在为null */
    ProfileDO find(@Param("tenant") String tenant,@Param("member") String member);
    /** @param tenant 当前可信企业 @param member 当前可信账户 @return 本人有效角色名称；无自定义角色仍列基础角色 */
    List<String> roles(@Param("tenant") String tenant,@Param("member") String member);
    /** @param tenant 当前可信企业 @param member 本人账户 @param name 已验证显示名称 @param revision 最新资料版本 @return 更新数，0为并发变化 */
    int update(@Param("tenant") String tenant,@Param("member") String member,@Param("name") String name,@Param("revision") int revision);
    /** @param tenant 当前可信企业 @param member 本人账户 @param hash 新的BCrypt摘要，禁止日志 @param authVersion 本次有效认证版本 @return 更新数，0为身份已变化；递增版本使全部旧浏览器会话失效 */
    int password(@Param("tenant") String tenant,@Param("member") String member,@Param("hash") String hash,@Param("authVersion") int authVersion);
}
